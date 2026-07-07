const { BigQuery } = require('@google-cloud/bigquery');

class BigQueryDatabaseHelper {
    constructor(config) {
        this.config = config;
        this.bigQueryClient = null;
        this.initializeClient();
    }

    // Initialize BigQuery client
    initializeClient() {
        try {
            const options = {
                projectId: this.config.projectId
            };

            if (this.config.keyFilename) {
                // Check if it's a file path or JSON object
                if (this.config.keyFilename.startsWith('{') || this.config.keyFilename.startsWith('"')) {
                    // Direct JSON object provided
                    try {
                        const credentials = JSON.parse(this.config.keyFilename);
                        options.credentials = credentials;
                        console.log('BigQuery: 🔑 Using direct JSON credentials');
                    } catch (parseError) {
                        console.error('BigQuery: ❌ Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS:', parseError.message);
                        this.bigQueryClient = null;
                        return false;
                    }
                } else {
                    // File path provided
                    const fs = require('fs');
                    if (fs.existsSync(this.config.keyFilename)) {
                        options.keyFilename = this.config.keyFilename;
                        console.log(`BigQuery: 📁 Using credentials file: ${this.config.keyFilename}`);
                    } else {
                        console.error(`BigQuery: ❌ Credentials file not found: ${this.config.keyFilename}`);
                        console.error('BigQuery: 💡 Please ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid JSON file path');
                        console.error('BigQuery: 📝 Example: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json');
                        console.error('BigQuery: 🔧 Or provide JSON directly: GOOGLE_APPLICATION_CREDENTIALS={"type":"service_account",...}');
                        this.bigQueryClient = null;
                        return false;
                    }
                }
            } else {
                console.warn('BigQuery: ⚠️ No GOOGLE_APPLICATION_CREDENTIALS provided, attempting to use default credentials');
            }

            this.bigQueryClient = new BigQuery(options);
            console.log('BigQuery: ✅ BigQuery client initialized successfully');
            return true;
        } catch (error) {
            console.error('BigQuery: ❌ Error initializing BigQuery client:', error.message);
            if (error.message.includes('ENOENT')) {
                console.error('BigQuery: 🔍 This appears to be a file path issue. Please check:');
                console.error('BigQuery:    1. GOOGLE_APPLICATION_CREDENTIALS environment variable is set correctly');
                console.error('BigQuery:    2. The credentials file exists at the specified path');
                console.error('BigQuery:    3. The file contains valid service account JSON');
                console.error('BigQuery:    4. Or provide JSON directly in the environment variable');
            }
            this.bigQueryClient = null;
            return false;
        }
    }

    // Ensure table exists
    async ensureTableExists() {
        if (!this.bigQueryClient) {
            throw new Error('BigQuery client not initialized');
        }

        try {
            const dataset = this.bigQueryClient.dataset(this.config.datasetId);
            const table = dataset.table(this.config.tableId);

            const [exists] = await table.exists();

            if (!exists) {
                console.log(`📊 Creating BigQuery table: ${this.config.datasetId}.${this.config.tableId}`);

                if (!this.config.schema) {
                    throw new Error('Schema is required for table creation');
                }

                const [table] = await dataset.createTable(this.config.tableId, { schema: this.config.schema });
                console.log(`BigQuery: ✅ BigQuery table created: ${this.config.datasetId}.${this.config.tableId}`);
            } else {
                console.log(`BigQuery: 📊 BigQuery table exists: ${this.config.datasetId}.${this.config.tableId}`);
            }
        } catch (error) {
            console.error('BigQuery: ❌ Error ensuring table exists:', error.message);
            throw error;
        }
    }

    // Clean row for BigQuery based on schema
    cleanRowForBigQuery(row, schema) {
        const validFields = schema.map(field => field.name);
        const cleaned = {};

        validFields.forEach((key) => {
            let value = row[key];

            if (value === undefined || value === null) {
                // Skip undefined/null fields to avoid schema errors
                return;
            }

            if (value instanceof Date) {
                cleaned[key] = value.toISOString();
                return;
            }

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                cleaned[key] = JSON.stringify(value);
                return;
            }

            if (Array.isArray(value)) {
                cleaned[key] = JSON.stringify(value);
                return;
            }

            // Handle boolean field conversion (string "0"/"1" to boolean false/true)
            const fieldSchema = schema.find(field => field.name === key);
            if (fieldSchema && fieldSchema.type === 'BOOLEAN') {
                if (typeof value === 'string') {
                    cleaned[key] = value === '1' || value === 'true';
                } else if (typeof value === 'number') {
                    cleaned[key] = value === 1;
                } else {
                    cleaned[key] = Boolean(value);
                }
                return;
            }

            // Skip problematic fields that cause type conversion issues
            const problematicFields = ['email_verify_status'];
            if (problematicFields.includes(key)) {
                console.log(`BigQuery: ⚠️ Skipping problematic field: ${key}`);
                return;
            }

            cleaned[key] = value;
        });

        return cleaned;
    }

    // Insert rows into BigQuery
    async insertRows(rows, options = {}) {
        if (!this.bigQueryClient) {
            throw new Error('BigQuery client not initialized');
        }

        if (!this.config.schema) {
            throw new Error('Schema is required for insert operation');
        }

        let processedRows;

        try {
            await this.ensureTableExists();

            processedRows = rows.map(row =>
                this.cleanRowForBigQuery({
                    ...row,
                    sync_timestamp: new Date(),
                    updated_at: row.updated_at || row.date_n_time || new Date()
                }, this.config.schema)
            );

            console.log(`BigQuery: 📊 Inserting ${processedRows.length} rows to BigQuery...`);

            const dataset = this.bigQueryClient.dataset(this.config.datasetId);
            const table = dataset.table(this.config.tableId);

            const [result] = await table.insert(processedRows, { ignoreUnknownValues: true });

            // Handle PartialFailure specifically
            if (result && result.insertErrors && result.insertErrors.length > 0) {
                const failedCount = result.insertErrors.length;
                const successCount = processedRows.length - failedCount;

                console.log(`BigQuery: ⚠️ ${failedCount} rows failed, ${successCount} succeeded`);

                // Show only first 3 errors for debugging
                result.insertErrors.slice(0, 3).forEach((error, index) => {
                    console.error(`BigQuery: ❌ Error ${index + 1}: ${error.message}`);
                });

                if (failedCount > 3) {
                    console.log(`BigQuery: ... and ${failedCount - 3} more errors`);
                }

                return processedRows.slice(0, successCount);
            }

            console.log(`BigQuery: ✅ Inserted ${processedRows.length} rows`);
            return processedRows;

        } catch (error) {
            // Handle PartialFailureError specifically
            if (error.name === 'PartialFailureError') {
                let failedCount = 0;

                if (error.errors && Array.isArray(error.errors)) {
                    failedCount = error.errors.length;

                    // Show only first 3 errors
                    error.errors.slice(0, 5).forEach((e, i) => {
                        console.error(`❌ Row ${e.rowIndex}:`);
                        e.errors.forEach((detail) => {
                            console.error(`   → ${detail.message}`);
                        });
                    });

                    if (failedCount > 3) {
                        console.log(`BigQuery: ... and ${failedCount - 3} more errors`);
                    }
                }

                const successCount = processedRows ? processedRows.length - failedCount : 0;
                console.log(`BigQuery: ⚠️ ${failedCount} failed, ${successCount} succeeded`);

                return processedRows ? processedRows.slice(0, successCount) : [];
            }

            // For other errors, show minimal info
            console.error('BigQuery: ❌ Insert error:', error.message);
            throw error;
        }
    }

    // Upsert rows (update existing and insert new ones) using MERGE
    async upsertRows(rows, options = {}) {
        if (!this.bigQueryClient) {
            throw new Error('BigQuery client not initialized');
        }

        if (!rows || rows.length === 0) {
            console.log('BigQuery: ℹ️ No rows to upsert');
            return { updated: 0, inserted: 0, total: 0 };
        }

        if (!this.config.schema) {
            throw new Error('Schema is required for upsert operation');
        }

        const idField = options.idField || '_id';
        const batchSize = options.batchSize || 100;

        try {
            await this.ensureTableExists();

            console.log(`BigQuery: 🔄 Processing ${rows.length} rows for upsert...`);

            // Clean and prepare all rows
            const cleanedRows = rows.map(row =>
                this.cleanRowForBigQuery({
                    ...row,
                    sync_timestamp: new Date(),
                    updated_at: row.updated_at || row.date_n_time || new Date()
                }, this.config.schema)
            );

            let totalUpdated = 0;
            let totalInserted = 0;

            for (let i = 0; i < cleanedRows.length; i += batchSize) {
                const batch = cleanedRows.slice(i, i + batchSize);

                try {
                    // Create temporary table for the batch
                    const tempTableId = `${this.config.tableId}_temp_${Date.now()}_${Math.floor(i / batchSize)}`;
                    const tempTable = this.bigQueryClient.dataset(this.config.datasetId).table(tempTableId);

                    // Create temp table with same schema
                    await tempTable.create({ schema: this.config.schema });

                    // Insert batch into temp table
                    await tempTable.insert(batch, { ignoreUnknownValues: true });

                    // Build MERGE query dynamically
                    const updateFields = this.config.schema
                        .filter(field => field.name !== idField)
                        .map(field => `${field.name} = S.${field.name}`)
                        .join(',\n                            ');

                    const mergeQuery = `
                        MERGE \`${this.config.projectId}.${this.config.datasetId}.${this.config.tableId}\` T
                        USING \`${this.config.projectId}.${this.config.datasetId}.${tempTableId}\` S
                        ON T.${idField} = S.${idField}
                        WHEN MATCHED THEN
                            UPDATE SET 
                                ${updateFields}
                        WHEN NOT MATCHED THEN
                            INSERT ROW
                    `;

                    const [mergeResult] = await this.bigQueryClient.query(mergeQuery);

                    // Get statistics from the merge operation
                    const statsQuery = `
                        SELECT 
                            COUNT(CASE WHEN T.${idField} IS NOT NULL THEN 1 END) as updated,
                            COUNT(CASE WHEN T.${idField} IS NULL THEN 1 END) as inserted
                        FROM \`${this.config.projectId}.${this.config.datasetId}.${tempTableId}\` S
                        LEFT JOIN \`${this.config.projectId}.${this.config.datasetId}.${this.config.tableId}\` T ON S.${idField} = T.${idField}
                    `;

                    const [stats] = await this.bigQueryClient.query(statsQuery);
                    totalUpdated += stats[0].updated;
                    totalInserted += stats[0].inserted;

                    // Clean up temp table
                    await tempTable.delete();

                    console.log(`BigQuery: ✅ Batch ${Math.floor(i / batchSize) + 1} processed: ${stats[0].updated} updated, ${stats[0].inserted} inserted`);

                } catch (batchError) {
                    console.error(`BigQuery: ❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, batchError.message);
                    // Continue with next batch
                }
            }

            const total = totalUpdated + totalInserted;
            console.log(`BigQuery: ✅ Upsert complete: ${totalUpdated} updated, ${totalInserted} inserted, ${total} total`);

            return {
                updated: totalUpdated,
                inserted: totalInserted,
                total: total
            };

        } catch (error) {
            console.error('BigQuery: ❌ Upsert error:', error.message);
            throw error;
        }
    }

    // Get row count
    async getRowCount() {
        if (!this.bigQueryClient) {
            throw new Error('BigQuery client not initialized');
        }

        try {
            // First check if table exists
            const dataset = this.bigQueryClient.dataset(this.config.datasetId);
            const table = dataset.table(this.config.tableId);
            const [exists] = await table.exists();

            if (!exists) {
                console.log(`BigQuery: ⚠️ Table ${this.config.datasetId}.${this.config.tableId} does not exist, row count is 0`);
                return 0;
            }

            const query = `SELECT COUNT(*) as count FROM \`${this.config.projectId}.${this.config.datasetId}.${this.config.tableId}\``;
            const [rows] = await this.bigQueryClient.query(query);
            return rows[0].count;
        } catch (error) {
            console.error('❌ Error getting row count:', error.message);
            return 0;
        }
    }

    // Ensure table exists
    async ensureTableExists() {
        if (!this.bigQueryClient) {
            throw new Error('BigQuery client not initialized');
        }

        try {
            const dataset = this.bigQueryClient.dataset(this.config.datasetId);
            const table = dataset.table(this.config.tableId);

            const [exists] = await table.exists();

            if (!exists) {
                console.log(`BigQuery: 📋 Creating table ${this.config.datasetId}.${this.config.tableId}...`);

                const options = {
                    schema: this.config.schema,
                    location: 'US'
                };

                try {
                    const [tableResult] = await table.create(options);
                    console.log(`BigQuery: ✅ Table ${this.config.datasetId}.${this.config.tableId} created successfully`);
                    return true;
                } catch (createError) {
                    console.error(`BigQuery: ❌ Failed to create table ${this.config.datasetId}.${this.config.tableId}: ${createError.message}`);
                    throw createError;
                }
            } else {
                console.log(`BigQuery: 📋 Table ${this.config.datasetId}.${this.config.tableId} already exists`);
                return false;
            }
        } catch (error) {
            console.error(`BigQuery: ❌ Error ensuring table exists: ${error.message}`);
            // Don't throw error here, just log it and continue
            // This allows operations to proceed and give more specific error messages
            return false;
        }
    }

    // Check if client is ready
    isClientReady() {
        return this.bigQueryClient !== null;
    }

    // Truncate table (delete all entries without deleting the table)
    async truncateTable() {
        if (!this.bigQueryClient) {
            throw new Error('BigQuery client not initialized');
        }

        try {
            // First ensure table exists (this will create it if needed)
            await this.ensureTableExists();

            // Check if table actually exists after ensureTableExists
            const dataset = this.bigQueryClient.dataset(this.config.datasetId);
            const table = dataset.table(this.config.tableId);
            const [exists] = await table.exists();

            if (!exists) {
                console.log(`BigQuery: ⚠️ Table ${this.config.datasetId}.${this.config.tableId} does not exist, cannot truncate`);
                return { numDroppedRows: 0 };
            }

            // Use TRUNCATE TABLE instead of DELETE to avoid streaming buffer issues
            const truncateQuery = `TRUNCATE TABLE \`${this.config.projectId}.${this.config.datasetId}.${this.config.tableId}\``;
            const [result] = await this.bigQueryClient.query(truncateQuery);

            console.log(`BigQuery: 🗑️ Truncated table ${this.config.datasetId}.${this.config.tableId}`);
            return result;
        } catch (error) {
            console.error('BigQuery: ❌ Error truncating table:', error.message);
            throw error;
        }
    }

    // Get config
    getConfig() {
        return this.config;
    }
}

module.exports = BigQueryDatabaseHelper;
