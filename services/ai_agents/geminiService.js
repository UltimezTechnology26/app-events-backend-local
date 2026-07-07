const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const path = require('path');
const BigQueryDatabaseHelper = require('../../config/bigquery-database-helper');
require('dotenv').config();


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// BigQuery configuration for storing PRD analysis results
const prdResultsBigQuery = new BigQueryDatabaseHelper({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    datasetId: 'project_management',
    tableId: 'ticket_phases',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    schema: [
        { name: 'doc_id', type: 'STRING' },
        { name: 'ticket_id', type: 'STRING' },
        { name: 'doc_url', type: 'STRING' },
        { name: 'project_type', type: 'STRING' },
        { name: 'file_structure', type: 'JSON' },
        { name: 'roadmap_data', type: 'JSON' },
        { name: 'total_phases', type: 'INTEGER' },
        { name: 'existing_files_count', type: 'INTEGER' },
        { name: 'new_files_count', type: 'INTEGER' },
        { name: 'pinecone_matches_count', type: 'INTEGER' },
        { name: 'namespaces_queried', type: 'JSON' },
        { name: 'analysis_timestamp', type: 'TIMESTAMP' },
        { name: 'sync_timestamp', type: 'TIMESTAMP' }
    ]
});
const taskCompletionBigQuery = new BigQueryDatabaseHelper({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    datasetId: 'project_management',
    tableId: 'task_completion',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    schema: [
        { name: 'task_id', type: 'STRING' },           // Unique identifier for each task
        { name: 'ticket_id', type: 'STRING' },           // Reference to the parent ticket
        { name: 'file_path', type: 'STRING' },           // File path for the task
        { name: 'user_id', type: 'STRING' },             // User who completed the task
        { name: 'completion_status', type: 'STRING' },    // 'pending', 'in_progress', 'completed', 'skipped'
        { name: 'completion_date', type: 'TIMESTAMP' }        // When the record was last updated
    ]
});

// 1. Target your specific Pinecone Index using the Host
const index = pc.index(process.env.PINECONE_INDEX_NAME, process.env.PINECONE_HOST);

/**
 * HELPER: Generate a single embedding for the query (PRD text)
 * Important: Must match the 3072 dimensions used during ingestion.
 */
async function generateQueryEmbedding(text) {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await model.embedContent({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY", // Use QUERY for search
        outputDimensionality: 3072,
    });
    return result.embedding.values;
}

const getDocId = (url) => {
    const match = url.match(/\/d\/(.*?)(\/|$)/);
    return match ? match[1] : null;
};

/**
 * Retrieve PRD analysis results for a single document by ticket_id
 * @param {string} ticketId - The ticket ID
 * @returns {Object|null} - The analysis result with task statuses or null if not found
 */
exports.getAnalysisResult = async (ticketId) => {
    try {
        if (!prdResultsBigQuery.isClientReady()) {
            throw new Error('BigQuery client not initialized');
        } // Use ticketId as primary key

        if (!ticketId) {
            console.error(`❌ Error retrieving analysis results: ticketId is undefined`);
            return null;
        }

        console.log(`🔍 Retrieving analysis results for ticket_id: ${ticketId}`);
        
        const query = `
            SELECT 
                doc_id,
                doc_url,
                ticket_id,
                project_type,
                file_structure,
                roadmap_data,
                total_phases,
                existing_files_count,
                new_files_count,
                pinecone_matches_count,
                namespaces_queried,
                analysis_timestamp,
                sync_timestamp
            FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.project_management.ticket_phases\` 
            WHERE ticket_id = @ticketId
            ORDER BY analysis_timestamp DESC
            LIMIT 1
        `;

        const options = {
            query: query,
            params: { ticketId: ticketId }
        };

        const [rows] = await prdResultsBigQuery.bigQueryClient.query(options);
        
        if (rows && rows.length > 0) {
            console.log(`✅ Found analysis results for ticket_id: ${ticketId}`);
            
            // Parse the roadmap_data from JSON string to object
            let roadmapData;
            try {
                if (typeof rows[0].roadmap_data === 'string') {
                    roadmapData = JSON.parse(rows[0].roadmap_data);
                } else {
                    roadmapData = rows[0].roadmap_data;
                }
                console.log("✅ Successfully parsed roadmap_data from BigQuery");
            } catch (parseError) {
                console.error("❌ Failed to parse roadmap_data:", parseError.message);
                throw new Error(`Failed to parse stored roadmap data: ${parseError.message}`);
            }

            // Fetch task completion statuses for this ticket
            try {
                console.log("🔄 Fetching task completion statuses...");
                const taskCompletions = await exports.getTicketTaskCompletions(ticketId);
                
                // Create a map of task_id to task completion data for quick lookup
                const taskStatusMap = {};
                taskCompletions.forEach(task => {
                    taskStatusMap[task.task_id] = {
                        task_id: task.task_id,
                        completion_status: task.completion_status,
                        user_id: task.user_id,
                        completion_date: task.completion_date,
                        task_name: task.task_name,
                        phase_title: task.phase_title,
                        technical_description: task.technical_description,
                        estimated_hours: task.estimated_hours
                    };
                });

                // Enrich roadmap data with task completion statuses
                if (roadmapData.phases && Array.isArray(roadmapData.phases)) {
                    roadmapData.phases.forEach(phase => {
                        if (phase.tasks && Array.isArray(phase.tasks)) {
                            phase.tasks.forEach(task => {
                                // Generate the same task_id as used in initializeTaskCompletions
                                const taskId = `${ticketId}_${phase.file_path.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${task.task_name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
                                
                                if (taskStatusMap[taskId]) {
                                    // Add task completion status to the task
                                    task.completion_status = taskStatusMap[taskId].completion_status;
                                    task.user_id = taskStatusMap[taskId].user_id;
                                    task.completion_date = taskStatusMap[taskId].completion_date;
                                    task.task_id = taskStatusMap[taskId].task_id;
                                    task.technical_description = taskStatusMap[taskId].technical_description;
                                    task.estimated_hours = taskStatusMap[taskId].estimated_hours;
                                } else {
                                    // Default status if not found in task completion table
                                    task.completion_status = 'pending';
                                    task.user_id = null;
                                    task.completion_date = null;
                                    task.task_id = taskId;
                                }
                            });
                        } else {
                            // Handle phases without individual tasks - create a single task record
                            const taskId = `${ticketId}_${phase.file_path.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
                            
                            if (taskStatusMap[taskId]) {
                                phase.completion_status = taskStatusMap[taskId].completion_status;
                                phase.user_id = taskStatusMap[taskId].user_id;
                                phase.completion_date = taskStatusMap[taskId].completion_date;
                                phase.task_id = taskStatusMap[taskId].task_id;
                            } else {
                                phase.completion_status = 'pending';
                                phase.user_id = null;
                                phase.completion_date = null;
                                phase.task_id = taskId;
                            }
                        }
                    });
                }
                
                console.log(`✅ Enriched roadmap data with ${taskCompletions.length} task completion statuses`);
            } catch (taskError) {
                console.warn("⚠️ Failed to fetch task completion statuses:", taskError.message);
                // Continue without task statuses - don't fail the entire function
            }
            
            return roadmapData;
        } else {
            console.log(`⚠️ No analysis results found for ticket_id: ${ticketId}`);
            return null;
        }

    } catch (error) {
        console.error(`❌ Error retrieving analysis results: ${error.message}`);
        throw error;
    }
};


exports.analyzePRD = async (docUrl, fileStructure, sonarProjectKey, projectType, ticket_id) => {
    try {
        // Extract docId at the very beginning to ensure it's available in all scopes
        const docId = getDocId(docUrl);
        if (!docId) {
            throw new Error("Invalid Google Doc URL - could not extract docId");
        }

        // 0. CHECK IF ANALYSIS ALREADY EXISTS
        console.log("🔍 Checking for existing analysis results...", process.env.GOOGLE_CLOUD_PROJECT_ID);
        const existingResult = await exports.getAnalysisResult(ticket_id);
        
        if (existingResult) {
            console.log("✅ Found existing analysis results, returning cached result");
            return existingResult; // existingResult is now already the roadmap_data
        }

        console.log("📝 No existing results found, proceeding with new analysis...");
        
        // ... [Keep your Doc ID and URL logic same] ...
        const response = await axios.get(`https://docs.google.com/document/d/${docId}/export?format=txt`);
        const prdText = response.data;

        // 1. PROCESS NEW FILE STRUCTURE FORMAT
        let structureArray = [];
        let normalizedStructure = "";
        console.log(fileStructure,  'fileStructure');
        
        if (Array.isArray(fileStructure)) {
            // New format: array of objects with file_name, module, file_type
            structureArray = fileStructure.map(item => {
                const fileName = item.file_path || "";
                return fileName.replace(/\\/g, '/').toLowerCase().trim();
            }).filter(Boolean);
            
            // Create a formatted string representation for the AI prompt
            normalizedStructure = fileStructure.map(item => {
                const fileName = item.file_path || "";
                const module = item.module || "";
                const fileType = item.file_type || "";
                return `${fileName} (module: ${module}, type: ${fileType})`;
            }).join('\n');
        } else {
            // Legacy format: comma-separated string (fallback)
            normalizedStructure = fileStructure.replace(/\\/g, '/');
            structureArray = fileStructure.split(',').map(p => p.trim().replace(/\\/g, '/').toLowerCase());
        }

        // 2. FETCH EMBEDDING FOR THE PRD
        console.log(" Vectorizing PRD for search...");
        const queryVector = await generateQueryEmbedding(prdText);

        // 3. PINECONE RETRIEVAL
        let codeContext = "";
        let dbFoundFiles = new Set(); 

        try {
            // Get unique modules from fileStructure to determine which namespaces to query
            const modules = Array.isArray(fileStructure) 
                ? [...new Set(fileStructure.map(item => item.module).filter(Boolean))]
                : ['app-frontend']; // Default for legacy format

            console.log("Querying namespaces for modules:", modules);

            // Query each relevant namespace
            console.log(modules, "modules");
            
            const allMatches = [];
            for (const module of modules) {
                
                try {
                    const queryResponse = await index.namespace(module).query({
                        vector: queryVector,
                        topK: 100,
                        includeMetadata: true
                    });

                    if (queryResponse.matches && queryResponse.matches.length > 0) {
                        allMatches.push(...queryResponse.matches);
                        console.log(`Found ${queryResponse.matches.length} matches in namespace: ${module}`);
                    }
                } catch (namespaceError) {
                    console.warn(`⚠️ Failed to query namespace '${module}':`, namespaceError.message);
                }
            }

            // Sort all matches by score (highest first) and take top 30 overall
            allMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
            

            if (allMatches.length > 0) {
                codeContext = allMatches.map(match => {
                    const filePath = match.metadata.path;
                    const codeSnippet = match.metadata.code || "";
                    
                    dbFoundFiles.add(filePath.toLowerCase().trim());

                    return `[FILE_CONFIRMED_IN_DB]: ${filePath}\nSOURCE_CODE:\n${codeSnippet}\n---`;
                }).join("\n\n");
            }

            console.log(`Total matches found: ${allMatches.length} from ${modules.length} namespaces`);
        } catch (dbError) {
            console.warn("⚠️ Pinecone retrieval failed:", dbError.message);
        }
        console.log(dbFoundFiles, "dbFoundFiles");

        // 4. AI PROMPT (Remains similar, but optimized for Pinecone context)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Speed optimized
        const prompt = `
        <role>Tech Lead AI</role>
        
        <task_instructions>
        1. STRICT ACTION LOGIC:
           - Scan <existing_code_context> for the tag "[FILE_CONFIRMED_IN_DB]".
           - If a file path exists in that block, the action MUST be "EXISTING".
           - If a file is suggested but NOT found in the context, the action MUST be "NEW".
        
        2. DATA SOURCES:
           - Use <file_structure> to understand the project layout.
           - Use <existing_code_context> to see the actual logic of existing files.
        </task_instructions>

        <json_schema>
        {
          "phases": [
            {
              "file_path": "string",
              "phase_title": "string",
              "action": "EXISTING | NEW",
              "tasks": [ { "task_name": "string", "technical_description": "string", "estimated_hours": number } ]
            }
          ]
        }
        </json_schema>

        <input_data>
            <prd>${prdText}</prd>
            <file_structure>${normalizedStructure}</file_structure>
            <existing_code_context>${codeContext || "No relevant files found."}</existing_code_context>
        </input_data>
        <output_constraint>Return raw JSON matching the schema.</output_constraint>
        `;

        const result = await model.generateContent(prompt);
        const aiResponse = result.response.text().replace(/```json|```/g, "").trim();
        
        console.log("🤖 AI Response (raw):", aiResponse);
        
        let parsedRoadmap;
        try {
            parsedRoadmap = JSON.parse(aiResponse);
            console.log("✅ Successfully parsed AI response");
        } catch (jsonError) {
            console.error("❌ JSON Parsing Error:", jsonError.message);
            console.error("📍 Error position details:", jsonError);
            console.error("📝 Problematic AI response:", aiResponse);
            
            // Try to fix common JSON issues
            let fixedResponse = aiResponse;
            
            // Fix escaped quotes issues
            fixedResponse = fixedResponse.replace(/\\"/g, '"');
            fixedResponse = fixedResponse.replace(/\\'/g, "'");
            
            // Fix trailing commas
            fixedResponse = fixedResponse.replace(/,\s*}/g, '}');
            fixedResponse = fixedResponse.replace(/,\s*]/g, ']');
            
            try {
                parsedRoadmap = JSON.parse(fixedResponse);
                console.log("✅ Successfully parsed after fixing common issues");
            } catch (secondError) {
                console.error("❌ Still failed to parse after fixes");
                throw new Error(`AI response parsing failed: ${jsonError.message}. Original response: ${aiResponse.substring(0, 200)}...`);
            }
        }

        // 5. POST-PROCESSOR FAIL-SAFE
        if (parsedRoadmap.phases) {
            parsedRoadmap.phases = parsedRoadmap.phases.map(phase => {
                const cleanPath = phase.file_path.replace(/\\/g, '/').toLowerCase().trim();
                // Truth check against what Pinecone actually returned
                phase.action = dbFoundFiles.has(cleanPath) ? "EXISTING" : "NEW";
                return phase;
            });
        }

        // 6. STORE RESULTS IN BIGQUERY
        try {
            const existingCount = parsedRoadmap.phases?.filter(p => p.action === "EXISTING").length || 0;
            const newCount = parsedRoadmap.phases?.filter(p => p.action === "NEW").length || 0;
            
            const resultData = {
                ticket_id: ticket_id, // Use ticket_id as primary key
                doc_id: docId,
                doc_url: docUrl,
                project_type: projectType || 'unknown',
                file_structure: Array.isArray(fileStructure) ? fileStructure : null,
                roadmap_data: parsedRoadmap,
                total_phases: parsedRoadmap.phases?.length || 0,
                existing_files_count: existingCount,
                new_files_count: newCount,
                pinecone_matches_count: dbFoundFiles.size,
                namespaces_queried: Array.isArray(fileStructure) 
                    ? [...new Set(fileStructure.map(item => item.module).filter(Boolean))]
                    : ['app-frontend'],
                analysis_timestamp: new Date()
            };

            console.log("💾 Storing PRD analysis results in BigQuery...");
            await prdResultsBigQuery.insertRows([resultData]);
            console.log("✅ PRD analysis results stored successfully in BigQuery");

            // 7. INITIALIZE TASK COMPLETION TRACKING
            try {
                console.log("🔄 Initializing task completion tracking...");
                await initializeTaskCompletions(ticket_id, parsedRoadmap.phases || []);
                console.log("✅ Task completion tracking initialized successfully");
            } catch (phaseError) {
                console.warn("⚠️ Failed to initialize task completion tracking:", phaseError.message);
                // Don't fail the entire function if task tracking initialization fails
            }

        } catch (bqError) {
            console.warn("⚠️ Failed to store results in BigQuery:", bqError.message);
            // Don't fail the entire function if BigQuery storage fails
        }

        return parsedRoadmap;

    } catch (error) {
        console.error("❌ Roadmap Error:", error.message);
    throw error;
    }
};

/**
 * Generate a unique task ID based on ticket_id, file_path, and optionally task_name
 */
const generateTaskId = (ticketId, filePath, taskName = null) => {
    const cleanFilePath = filePath.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const cleanTaskName = taskName ? `_${taskName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}` : '';
    return `${ticketId}_${cleanFilePath}${cleanTaskName}`;
};

/**
 * Initialize task completion records for a new ticket
 * @param {string} ticketId - The ticket ID
 * @param {Array} phases - Array of phases from roadmap
 * @returns {Promise<Array>} - Array of created task records
 */
const initializeTaskCompletions = async (ticketId, phases) => {
    try {
        if (!taskCompletionBigQuery.isClientReady()) {
            throw new Error('BigQuery client not initialized');
        }

        // Create individual task records for each task within each phase
        const taskRecords = [];
        
        phases.forEach(phase => {
            if (phase.tasks && Array.isArray(phase.tasks)) {
                phase.tasks.forEach(task => {
                    taskRecords.push({
                        task_id: generateTaskId(ticketId, phase.file_path, task.task_name),
                        ticket_id: ticketId,
                        file_path: phase.file_path,
                        phase_title: phase.phase_title,
                        task_name: task.task_name,
                        technical_description: task.technical_description,
                        estimated_hours: task.estimated_hours,
                        user_id: null,
                        completion_status: 'pending',
                        completion_date: null
                    });
                });
            } else {
                // Fallback for phases without tasks (create a single task record)
                taskRecords.push({
                    task_id: generateTaskId(ticketId, phase.file_path),
                    ticket_id: ticketId,
                    file_path: phase.file_path,
                    phase_title: phase.phase_title,
                    task_name: phase.phase_title || 'Complete phase',
                    technical_description: null,
                    estimated_hours: null,
                    user_id: null,
                    completion_status: 'pending',
                    completion_date: null
                });
            }
        });

        console.log(`🔄 Initializing ${taskRecords.length} task completion records for ticket: ${ticketId}`);
        await taskCompletionBigQuery.insertRows(taskRecords);
        console.log("✅ Task completion records created successfully");

        return taskRecords;
    } catch (error) {
        console.error("❌ Error initializing task completions:", error.message);
        throw error;
    }
};

/**
 * Update task completion status
 * @param {string} taskId - The task ID to update
 * @param {string} userId - User ID making the update
 * @param {string} status - New completion status ('pending', 'in_progress', 'completed', 'skipped')
 * @returns {Promise<Object>} - Updated task record
 */
exports.updateTaskStatus = async (taskId, userId, status) => {
    try {
        if (!taskCompletionBigQuery.isClientReady()) {
            throw new Error('BigQuery client not initialized');
        }

        // First, get the existing record to preserve all fields
        const existingRecord = await exports.getTaskCompletion(taskId);
        if (!existingRecord) {
            throw new Error(`Task with ID ${taskId} not found`);
        }

        // Update only the fields we want to change, preserve everything else
        const updatedRecord = {
            ...existingRecord,
            user_id: userId,
            completion_status: status,
            completion_date: status === 'completed' ? new Date() : null
        };

        // Use insertRows which will replace the existing record due to unique task_id constraint
        // This bypasses the streaming buffer issue since INSERT operations are allowed
        await taskCompletionBigQuery.insertRows([updatedRecord]);

        console.log(`✅ Task ${taskId} status updated to '${status}' by user ${userId}`);
        
        // Return the updated record
        return await exports.getTaskCompletion(taskId);
    } catch (error) {
        console.error(`❌ Error updating task status for ${taskId}:`, error.message);
        throw error;
    }
};

/**
 * Get task completion record by task_id
 * @param {string} taskId - The task ID
 * @returns {Promise<Object|null>} - Task completion record or null
 */
exports.getTaskCompletion = async (taskId) => {
    try {
        if (!taskCompletionBigQuery.isClientReady()) {
            throw new Error('BigQuery client not initialized');
        }

        const query = `
            SELECT *
            FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.project_management.task_completion\`
            WHERE task_id = @taskId
            LIMIT 1
        `;

        const options = {
            query: query,
            params: { taskId: taskId }
        };

        const [rows] = await taskCompletionBigQuery.bigQueryClient.query(options);
        
        if (rows && rows.length > 0) {
            return rows[0];
        }
        return null;
    } catch (error) {
        console.error(` Error getting task completion for ${taskId}:`, error.message);
        throw error;
    }
};

/**
 * Get all task completions for a ticket
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<Array>} - Array of task completion records
 */
exports.getTicketTaskCompletions = async (ticketId) => {
    try {
        if (!taskCompletionBigQuery.isClientReady()) {
            throw new Error('BigQuery client not initialized');
        }

        const query = `
            SELECT *
            FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.project_management.task_completion\`
            WHERE ticket_id = @ticketId
            ORDER BY file_path ASC
        `;

        const options = {
            query: query,
            params: { ticketId: ticketId }
        };

        const [rows] = await taskCompletionBigQuery.bigQueryClient.query(options);
        return rows || [];
    } catch (error) {
        console.error(` Error getting task completions for ticket ${ticketId}:`, error.message);
        throw error;
    }
};

/**
 * Get task completion statistics for a ticket
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<Object>} - Statistics object
 */
exports.getTaskCompletionStats = async (ticketId) => {
    try {
        if (!taskCompletionBigQuery.isClientReady()) {
            throw new Error('BigQuery client not initialized');
        }

        const query = `
            SELECT 
                completion_status,
                COUNT(*) as count
            FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.project_management.task_completion\`
            WHERE ticket_id = @ticketId
            GROUP BY completion_status
        `;

        const options = {
            query: query,
            params: { ticketId: ticketId }
        };

        const [rows] = await taskCompletionBigQuery.bigQueryClient.query(options);
        
        const stats = {
            total_tasks: 0,
            pending: 0,
            in_progress: 0,
            completed: 0,
            skipped: 0
        };

        rows.forEach(row => {
            stats.total_tasks += row.count;
            stats[row.completion_status] = row.count;
        });

        return stats;
    } catch (error) {
        console.error(` Error getting task completion stats for ticket ${ticketId}:`, error.message);
        throw error;
    }
};
// const { google } = require('googleapis');
// const axios = require('axios');
// const { ChromaClient } = require('chromadb');
// const crypto = require('crypto'); // Built-in for Hashing

// // 0. Configuration & Caching Utility
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const model = genAI.getGenerativeModel({ 
//     model: "gemini-2.5-flash", // Using 2.0-flash for speed/reliability
//     generationConfig: {
//         temperature: 0, // CRITICAL: Makes AI deterministic (less random)
//         topP: 0.1,
//     }
// });

// // Helper to create a fingerprint of inputs
// const generateInputHash = (prd, structure, code, sonar) => {
//     const combinedInput = prd + structure + code + JSON.stringify(sonar);
//     return crypto.createHash('md5').update(combinedInput).digest('hex');
// };

// const getDocId = (url) => {
//     const match = url.match(/\/d\/(.*?)(\/|$)/);
//     return match ? match[1] : null;
// };

// // /**
// //  * Fetches data from multiple SonarQube projects in parallel
// //  */
// const fetchAllSonarData = async (sonarKeys) => {
//     // 1. Safety Check: If null/undefined, return empty array immediately
//     if (!sonarKeys) {
//         console.warn("No Sonar keys provided, skipping Sonar analysis.");
//         return [];
//     }

//     // 2. Handle both String and Object safely
//     const keysToFetch = typeof sonarKeys === 'string'
//         ? [sonarKeys]
//         : Object.values(sonarKeys);

//     try {
//         const allProjectData = await Promise.all(
//             keysToFetch.map(key => fetchSonarData(key))
//         );
//         return allProjectData.flat();
//     } catch (error) {
//         console.error("Global Sonar Fetch Error:", error.message);
//         return [];
//     }
// };

// // /**
// //  * Fetches issues and hotspots for a single project key
// //  */
// const fetchSonarData = async (projectKey) => {
//     const SONAR_URL = process.env.SONAR_URL;
//     const auth = { username: process.env.SONAR_TOKEN, password: '' };

//     try {
//         const [issuesRes, hotspotsRes] = await Promise.all([
//             axios.get(`${SONAR_URL}/api/issues/search`, {
//                 params: { componentKeys: projectKey, resolved: 'false' }, auth
//             }),
//             axios.get(`${SONAR_URL}/api/hotspots/search`, {
//                 params: { projectKey: projectKey, status: 'TO_REVIEW' }, auth
//             })
//         ]);

//         const issues = (issuesRes.data.issues || []).map(i => ({
//             type: i.type,
//             message: i.message,
//             file: i.component.split(':').pop(),
//             project_context: projectKey // Helps AI distinguish between stacks
//         }));

//         const hotspots = (hotspotsRes.data.hotspots || []).map(h => ({
//             type: "SECURITY_HOTSPOT",
//             message: h.message,
//             file: h.component.split(':').pop(),
//             priority: h.securityCategory,
//             project_context: projectKey
//         }));

//         return [...issues, ...hotspots];
//     } catch (error) {
//         console.error(`SonarQube Error for ${projectKey}:`, error.message);
//         return [];
//     }
// };

// exports.analyzePRD = async (docUrl, fileStructure, sonarProjectKey, projectType) => {
//     try {
//         const docId = getDocId(docUrl);
//         if (!docId) throw new Error("Invalid Google Doc URL");

//         // 1. DATA PREP & NORMALIZATION
//         // We normalize paths to forward slashes to ensure matching works across OS types
//         const normalizedStructure = fileStructure.replace(/\\/g, '/');
//         const structureArray = fileStructure.split(',').map(p => p.trim().replace(/\\/g, '/').toLowerCase());

//         // 2. FETCH PRD TEXT
//         const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
//         const response = await axios.get(exportUrl);
//         const prdText = response.data;

//         // 3. FETCH SONAR DATA
//         const sonarData = await fetchAllSonarData(sonarProjectKey);

//         // 4. CHROMADB VALIDATION & CONTEXT RETRIEVAL
//         let codeContext = "";
//         let existingFilesMap = new Set();
//         let dbFoundFiles = new Set(); // This is our "Source of Truth" for EXISTING files

//         try {
//             const client = new ChromaClient({ host: "127.0.0.1", port: 8000 });
//             const collection = await client.getCollection({ name: "coinpedia_codebase_v2" });

//             // Querying based on PRD to find relevant existing code
//             const searchResults = await collection.query({
//                 queryTexts: [prdText],
//                 nResults: 20, // Increased to ensure we find all relevant files
//                 where: { "project": "APP_COINPEDIA" },
//                 include: ["documents", "metadatas"]
//             });

//             if (searchResults.documents && searchResults.documents[0].length > 0) {
//                 codeContext = searchResults.documents[0].map((doc, i) => {
//                     const rawPath = searchResults.metadatas[0][i]?.path || searchResults.ids[0][i];
//                     const path = rawPath.replace(/\\/g, '/');
                    
//                     // CRITICAL: If ChromaDB returns this file, it is confirmed as EXISTING
//                     dbFoundFiles.add(path.toLowerCase().trim()); 

//                     const safeDoc = doc.replace(/`/g, '\\`').replace(/\${/g, '\\${');
//                     return `[FILE_CONFIRMED_IN_DB]: ${path}\nSOURCE_CODE:\n${safeDoc}\n---`;
//                 }).join("\n\n");
//             }
//         } catch (dbError) {
//             console.warn("ChromaDB validation step failed:", dbError.message);
//         }

//         // 5. GENERATE ROADMAP (Instructing AI to follow DB context)
//         const prompt = `
//         <role>Tech Lead AI</role>
        
//         <task_instructions>
//         1. STRICT ACTION LOGIC:
//            - Scan <existing_code_context> for the tag "[FILE_CONFIRMED_IN_DB]".
//            - If a file path exists in that block, the action MUST be "EXISTING".
//            - If a file is suggested but NOT found in the context, the action MUST be "NEW".
        
//         2. DATA SOURCES:
//            - Use <file_structure> to understand the project layout.
//            - Use <existing_code_context> to see the actual logic of existing files.
//         </task_instructions>

//         <json_schema>
//         {
//           "phases": [
//             {
//               "file_path": "string",
//               "phase_title": "string",
//               "action": "EXISTING | NEW",
//               "tasks": [ { "task_name": "string", "technical_description": "string", "estimated_hours": number } ]
//             }
//           ]
//         }
//         </json_schema>

//         <input_data>
//         <prd>${prdText}</prd>
//         <file_structure>${normalizedStructure}</file_structure> 
//         <existing_code_context>${codeContext || "No files found in database."}</existing_code_context>
//         </input_data>

//         <output_constraint>Return raw JSON only.</output_constraint>
//         `;

//         const result = await model.generateContent(prompt);
//         const aiResponse = result.response.text().replace(/```json|```/g, "").trim();
//         let parsedRoadmap = JSON.parse(aiResponse);

//         // 6. FINAL TRUTH OVERRIDE (The Fail-Safe)
//         // We iterate through the AI's response and check it against our dbFoundFiles Set
//         // 7. POST-PROCESSOR FAIL-SAFE (The "Truth" Layer)
//         if (parsedRoadmap.phases && Array.isArray(parsedRoadmap.phases)) {
//             parsedRoadmap.phases = parsedRoadmap.phases.map(phase => {
//                 const aiSuggestedPath = phase.file_path.replace(/\\/g, '/').toLowerCase().trim();

//                 // Check A: Does it exist in the file_structure you passed?
//                 const isInStructure = structureArray.includes(aiSuggestedPath);

//                 // Check B: Was it found in ChromaDB? (using the Set we built earlier)
//                 const isInChroma = existingFilesMap.has(aiSuggestedPath);

//                 if (isInStructure || isInChroma) {
//                     phase.action = "EXISTING";
//                     // Optional: If the AI hallucinated a slightly different name (e.g. ReportIssueModel), 
//                     // you can force it back to the exact name in your structure here.
//                     const exactMatch = structureArray.find(p => p === aiSuggestedPath);
//                     if (exactMatch) phase.file_path = exactMatch; 
//                 } else {
//                     phase.action = "NEW";
//                 }
//                 return phase;
//             });
//         }

//         return parsedRoadmap;

//     } catch (error) {
//         console.error("AI Agent Error:", error.message);
//         throw new Error(`Roadmap Process Failed: ${error.message}`);
//     }
// };

// exports.analyzePRD = async (docUrl, fileStructure, sonarProjectKey, projectType) => {
//     try {
//         const docId = getDocId(docUrl);
//         if (!docId) throw new Error("Invalid Google Doc URL");

//         // 1. DATA PREP & NORMALIZATION (Fixes the "not defined" error)
//         const normalizedStructure = fileStructure.replace(/\\/g, '/');
//         const structureArray = normalizedStructure.split(',').map(p => p.trim());

//         // 2. FETCH PRD TEXT
//         const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
//         const response = await axios.get(exportUrl);
//         const prdText = response.data;

//         // 3. FETCH SONAR DATA
//         const sonarData = await fetchAllSonarData(sonarProjectKey);

//         // 4. FETCH CONTEXT FROM CHROMADB & VERIFY EXISTENCE
//         let codeContext = "";
//         let existingFilesMap = new Set(); // To track what actually exists in the DB

//         try {
//             // Note: Use an instantiated client, e.g., 'const client = new ChromaClient();'
//             const client = new ChromaClient({ host: "127.0.0.1", port: 8000 });
//             const collection = await client.getCollection({ name: "coinpedia_codebase_v2" });

//             const searchResults = await collection.query({
//                 queryTexts: [prdText],
//                 nResults: 15,
//                 where: { "project": "APP_COINPEDIA" },
//                 include: ["documents", "metadatas"]
//             });

//             if (searchResults.documents && searchResults.documents[0].length > 0) {
//                 codeContext = searchResults.documents[0].map((doc, i) => {
//                     const rawPath = searchResults.metadatas[0][i]?.path || searchResults.ids[0][i];
//                     const path = rawPath.replace(/\\/g, '/');
                    
//                     // Mark as existing because it returned code from ChromaDB
//                     existingFilesMap.add(path.toLowerCase()); 

//                     const safeDoc = doc.replace(/`/g, '\\`').replace(/\${/g, '\\${');
//                     return `[FILE_EXISTS_IN_DB]: ${path}\nSOURCE_CODE:\n${safeDoc}\n---`;
//                 }).join("\n\n");
//             }
//         } catch (dbError) {
//             console.warn("ChromaDB context retrieval failed:", dbError.message);
//         }

//         // 5. CACHE CHECK (Stable results)
//         const currentHash = generateInputHash(prdText, normalizedStructure, codeContext, sonarData);
//         // [Add your roadmap_cache lookup logic here if needed]

//         // 6. GENERATE ROADMAP
//         const prompt = `
//         <role>Senior Fullstack Architect</role>
        
//         <task_instructions>
//         1. ACTION DETERMINATION (STRICT):
//            - A file is "EXISTING" ONLY if it appears in the <existing_code_context> block with [FILE_EXISTS_IN_DB].
//            - If a file is in <file_structure> but NOT in <existing_code_context>, it is "NEW".
        
//         2. PATH ACCURACY: Use exact paths from the input data.

//         3. FILE-CENTRIC GROUPING:
//           - Group all tasks by unique 'file_path'. One file = One Phase.

//         4. CHARACTER-PERFECT MATCHING:
//             - Match paths character-for-character. Use the exact string from <file_structure> or <existing_code_context>. No typos (e.g., 'Mode' vs 'Model').
//         </task_instructions>

//         <json_schema>
//         {
//           "phases": [
//             {
//               "file_path": "string",
//               "phase_title": "string",
//               "action": "EXISTING | NEW",
//               "tasks": [ { "task_name": "string", "technical_description": "string", "estimated_hours": number } ]
//             }
//           ]
//         }
//         </json_schema>

//         <input_data>
//         <prd_document>${prdText}</prd_document>
//         <file_structure>${normalizedStructure}</file_structure> 
//         <existing_code_context>${codeContext || "No matching code found in DB."}</existing_code_context>
//         <sonar_report>${JSON.stringify(sonarData)}</sonar_report>
//         </input_data>

//         <output_constraint>Return ONLY raw JSON.</output_constraint>
//         `;

//         const result = await model.generateContent(prompt);
//         const aiResponse = result.response.text().replace(/```json|```/g, "").trim();
//         let parsedRoadmap = JSON.parse(aiResponse);

//         // 7. POST-PROCESSOR FAIL-SAFE (Ensures the action matches ChromaDB reality)
//         if (parsedRoadmap.phases && Array.isArray(parsedRoadmap.phases)) {
//             parsedRoadmap.phases = parsedRoadmap.phases.map(phase => {
//                 const pathKey = phase.file_path.toLowerCase().trim();
//                 // Check if this file was actually found in ChromaDB during Step 4
//                 phase.action = existingFilesMap.has(pathKey) ? "EXISTING" : "NEW";
//                 return phase;
//             });
//         }

//         return parsedRoadmap;

//     } catch (error) {
//         console.error("AI Agent Error:", error.message);
//         throw new Error(`Failed to process roadmap: ${error.message}`);
//     }
// };

// ... [fetchAllSonarData and fetchSonarData remain unchanged] ...
// exports.analyzePRD = async (docUrl, fileStructure, sonarProjectKey, projectType) => {
//     try {
//         const docId = getDocId(docUrl);
//         if (!docId) throw new Error("Invalid Google Doc URL");

//         // 1. FETCH PRD TEXT
//         const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
//         const response = await axios.get(exportUrl);
//         const prdText = response.data;

//         // 2. FETCH SONAR DATA
//         const sonarData = await fetchAllSonarData(sonarProjectKey);

//         // 3. FETCH CONTEXT FROM CHROMADB (The missing part)
//         let codeContext = "No matching existing code found.";
//         try {
//             // Ensure you use the same ChromaClient instance/config
//             const collection = await ChromaClient.getCollection({ 
//                 name: "coinpedia_codebase_v2" 
//             });

//             const searchResults = await collection.query({
//                 queryTexts: [prdText],
//                 nResults: 10, // Increased results for better context
//                 where: { "project": "APP_COINPEDIA" },
//                 include: ["documents", "metadatas"]
//             });

//             if (searchResults.documents[0].length > 0) {
//                 codeContext = searchResults.documents[0].map((doc, i) => {
//                     const rawPath = searchResults.metadatas[0][i]?.path || searchResults.ids[0][i];
//                     // NORMALIZE PATH: Convert \\ to / so the AI doesn't get confused
//                     const path = rawPath.replace(/\\/g, '/');
//                     return `[EXISTS] FILE_PATH: ${path}\nSOURCE_CODE_FOLLOWS:\n${doc}\n---`;
//                 }).join("\n\n");
//             }
//         } catch (dbError) {
//             console.warn("ChromaDB context retrieval failed:", dbError.message);
//         }

//         // 4. GENERATE FINGERPRINT (For stable results on refresh)
//         const currentHash = generateInputHash(prdText, fileStructure, codeContext, sonarData);

//         // 5. CACHE CHECK
//         try {
//             const roadmapCollection = await ChromaClient.getCollection({ name: "roadmap_cache" });
//             const existing = await roadmapCollection.get({ ids: [currentHash] });

//             if (existing && existing.ids.length > 0) {
//                 console.log("✅ Cache Hit: Returning stable roadmap.");
//                 return JSON.parse(existing.documents[0]);
//             }
//         } catch (e) {
//             console.log("Cache miss, calling Gemini...");
//         }

//         // 6. GENERATE NEW ROADMAP
//         const prompt = `
//         <role>
//         You are a Senior Fullstack Architect. Generate a roadmap for ${projectType}.
//         </role>

//         <task_instructions>
//         1. STRUCTURAL HIERARCHY ANALYSIS:
//            - Analyze folder patterns in <file_structure> (e.g., App Router vs Pages Router, kebab-case vs camelCase).
//            - Suggest "NEW" files ONLY within existing directory patterns found in <file_structure>.
//            - Do not invent directory structures. If database models live in 'src/db/models', your new models must go there.

//         2. STRICT ACTION LOGIC:
//            - Action "EXISTING": ONLY if the file path has source code provided in <existing_code_context>.
//            - Action "NEW": If the path is listed in <file_structure> but has NO code in <existing_code_context>, OR if the file is brand new but follows project patterns.

//         3. CHARACTER-PERFECT MATCHING:
//            - Match paths character-for-character. Use the exact string from <file_structure> or <existing_code_context>. No typos (e.g., 'Mode' vs 'Model').

//         4. FILE-CENTRIC GROUPING:
//            - Group all tasks by unique 'file_path'. One file = One Phase.
//         </task_instructions>

//         <json_schema>
//         {
//           "phases": [
//             {
//               "file_path": "string (unique and accurate)",
//               "phase_title": "string (descriptive name)",
//               "action": "EXISTING | NEW",
//               "total_estimated_hours": number,
//               "tasks": [
//                 { "task_name": "string", "technical_description": "string", "estimated_hours": number }
//               ]
//             }
//           ]
//         }
//         </json_schema>

//         <input_data>
//         <prd_document>${prdText}</prd_document>
//         <file_structure>${normalizedStructure}</file_structure> 
//         <existing_code_context>${safeCodeContext}</existing_code_context>
//         <sonar_report>${JSON.stringify(sonarData)}</sonar_report>
//         </input_data>

//         <output_constraint>
//         Return ONLY raw JSON. No markdown.
//         </output_constraint>
//         `;
//         const result = await model.generateContent(prompt);
//         const aiResponse = result.response.text();
//         const cleanJson = aiResponse.replace(/```json|```/g, "").trim();
//         const parsedRoadmap = JSON.parse(cleanJson);

//         // 5. STORE IN CACHE: Save the result so it doesn't change next time
//         try {
//             const roadmapCollection = await ChromaClient.getOrCreateCollection({ name: "roadmap_cache" });
//             await roadmapCollection.add({
//                 ids: [currentHash],
//                 documents: [JSON.stringify(parsedRoadmap)],
//                 metadatas: [{ projectType, timestamp: Date.now() }]
//             });
//         } catch (cacheError) {
//             console.warn("Failed to save to cache:", cacheError.message);
//         }

//         return parsedRoadmap;

//     } catch (error) {
//         console.error("AI Agent Error:", error.message);
//         throw new Error("Failed to process roadmap.");
//     }
// };

{/* <task_instructions>
    1. PRE-ANALYSIS VERIFICATION:
    - Carefully read all file paths in <existing_code_context>.
    - Carefully read all file paths in <file_structure>.
    - If a file path exists in EITHER of those blocks, it is "EXISTING".
    2. STRICT "NEW" DEFINITION: 
    - A file is only "NEW" if it is absent from BOTH <existing_code_context> and <file_structure>. 
    - If you are suggesting a fix for an existing component (like ReportIssueModel.tsx), it MUST be marked "EXISTING".
    3. PATH NORMALIZATION: Treat "\\" and "/" as identical. Ignore case sensitivity for file paths.
    4. ACTION CONSOLIDATION: If you are adding a new feature to an existing file, the action is "EXISTING".
    5. FILE-CENTRIC GROUPING: Group all tasks by unique 'file_path'.
    </task_instructions> */}

// exports.analyzePRD = async (docUrl, fileStructure, sonarProjectKey, projectType) => {
//     try {
//         const docId = getDocId(docUrl);
//         if (!docId) throw new Error("Invalid Google Doc URL");

//         // 1. FETCH PRD TEXT
//         const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
//         const response = await axios.get(exportUrl);
//         const prdText = response.data;

//         // 2. FETCH CONTEXT FROM CHROMADB
//         let codeContext = "No matching existing code found.";
//         try {
//             const client = new ChromaClient({ host: "127.0.0.1", port: 8000 });
//             const collection = await client.getCollection({ name: "coinpedia_codebase_v2" });

//             const searchResults = await collection.query({
//                 queryTexts: [prdText],
//                 nResults: 8,
//                 where: { "project": "APP_COINPEDIA" },
//                 include: ["documents", "metadatas"]
//             });

//             if (searchResults.documents[0].length > 0) {
//                 codeContext = searchResults.documents[0].map((doc, i) => {
//                     const path = searchResults.metadatas[0][i]?.path || searchResults.ids[0][i];
//                     // Grounding check: only include if file actually exists in tree
//                     if (fileStructure.includes(path)) {
//                         return `FILE: ${path}\nCONTENT:\n${doc}`;
//                     }
//                     return null;
//                 }).filter(Boolean).join("\n\n---\n\n");
//             }
//         } catch (dbError) {
//             console.warn("ChromaDB retrieval failed:", dbError.message);
//         }

//         // 3. FETCH SONAR DATA
//         const sonarData = await fetchAllSonarData(sonarProjectKey);

//         // 4. CHECK CACHE (Logic to prevent change on refresh)
//         const currentHash = generateInputHash(prdText, fileStructure, codeContext, sonarData);
        
//         /* IMPLEMENTATION NOTE: 
//            Here you should check your Database (MongoDB/Redis) for 'currentHash'.
//            if (dbResponse) return dbResponse.roadmap;
//         */

//         // 5. GENERATE AI PROMPT
//         const prompt = `
//         <role>
//         You are a Senior Fullstack Architect. Generate a roadmap for ${projectType}.
//         </role>

//         <task_instructions>
//         1. FILE-CENTRIC GROUPING: You MUST group all tasks related to the same 'file_path' into a SINGLE phase. Do not create multiple phases for the same file.
//         2. ACTION CONSOLIDATION: If a file contains both existing code updates and new feature logic, mark the action as "EXISTING".
//         3. LOGICAL ORDERING: Order the phases by implementation priority (e.g., Database/API -> UI components -> Page integration).
//         4. PATH ACCURACY: Use EXACT paths from <file_structure>. 
//         5. UNIQUE PHASES: Every entry in the "phases" array must have a unique "file_path".
//         </task_instructions>

//         <json_schema>
//         {
//           "phases": [
//             {
//               "file_path": "string (unique)",
//               "phase_title": "string (descriptive name)",
//               "action": "EXISTING | NEW",
//               "total_estimated_hours": number,
//               "tasks": [
//                 { "task_name": "string", "technical_description": "string", "estimated_hours": number }
//               ]
//             }
//           ]
//         }
//         </json_schema>

//         <input_data>
//         <prd_document>${prdText}</prd_document>
//         <file_structure>${fileStructure}</file_structure> 
//         <existing_code_context>${codeContext}</existing_code_context>
//         <sonar_report>${JSON.stringify(sonarData)}</sonar_report>
//         </input_data>

//         <output_constraint>
//         Return ONLY raw JSON. No markdown.
//         </output_constraint>
//         `;

//         const result = await model.generateContent(prompt);
//         const aiResponse = result.response.text();
//         const cleanJson = aiResponse.replace(/```json|```/g, "").trim();
//         const parsedData = JSON.parse(cleanJson);

//         /* SAVE TO CACHE: 
//            await db.save({ hash: currentHash, roadmap: parsedData });
//         */

//         return parsedData;

//     } catch (error) {
//         console.error("AI Agent Error:", error.message);
//         throw new Error("Failed to process roadmap.");
//     }
// };





// const { GoogleGenerativeAI } = require("@google/generative-ai");
// const { google } = require('googleapis');
// const axios = require('axios');
// const { ChromaClient } = require('chromadb');

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// // Note: Ensure your API key supports gemini-1.5-flash or 2.0-flash
// const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// const getDocId = (url) => {
//     const match = url.match(/\/d\/(.*?)(\/|$)/);
//     return match ? match[1] : null;
// };

// /**
//  * Fetches data from multiple SonarQube projects in parallel
//  */
// const fetchAllSonarData = async (sonarKeys) => {
//     // 1. Safety Check: If null/undefined, return empty array immediately
//     if (!sonarKeys) {
//         console.warn("No Sonar keys provided, skipping Sonar analysis.");
//         return [];
//     }

//     // 2. Handle both String and Object safely
//     const keysToFetch = typeof sonarKeys === 'string'
//         ? [sonarKeys]
//         : Object.values(sonarKeys);

//     try {
//         const allProjectData = await Promise.all(
//             keysToFetch.map(key => fetchSonarData(key))
//         );
//         return allProjectData.flat();
//     } catch (error) {
//         console.error("Global Sonar Fetch Error:", error.message);
//         return [];
//     }
// };

// /**
//  * Fetches issues and hotspots for a single project key
//  */
// const fetchSonarData = async (projectKey) => {
//     const SONAR_URL = process.env.SONAR_URL;
//     const auth = { username: process.env.SONAR_TOKEN, password: '' };

//     try {
//         const [issuesRes, hotspotsRes] = await Promise.all([
//             axios.get(`${SONAR_URL}/api/issues/search`, {
//                 params: { componentKeys: projectKey, resolved: 'false' }, auth
//             }),
//             axios.get(`${SONAR_URL}/api/hotspots/search`, {
//                 params: { projectKey: projectKey, status: 'TO_REVIEW' }, auth
//             })
//         ]);

//         const issues = (issuesRes.data.issues || []).map(i => ({
//             type: i.type,
//             message: i.message,
//             file: i.component.split(':').pop(),
//             project_context: projectKey // Helps AI distinguish between stacks
//         }));

//         const hotspots = (hotspotsRes.data.hotspots || []).map(h => ({
//             type: "SECURITY_HOTSPOT",
//             message: h.message,
//             file: h.component.split(':').pop(),
//             priority: h.securityCategory,
//             project_context: projectKey
//         }));

//         return [...issues, ...hotspots];
//     } catch (error) {
//         console.error(`SonarQube Error for ${projectKey}:`, error.message);
//         return [];
//     }
// };

// // exports.analyzePRD = async (docUrl, fileStructure, sonarProjectKey, projectType) => {
// /**
// * Analyzes a PRD and generates a high-fidelity implementation roadmap.
// * Adheres to existing project structure and checks for technical debt via SonarQube.
// */
// exports.analyzePRD = async (docUrl, fileStructure, sonarProjectKey, projectType) => {
//     try {
//         const docId = getDocId(docUrl);
//         if (!docId) throw new Error("Invalid Google Doc URL");

//         // 1. FETCH PRD TEXT
//         const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
//         const response = await axios.get(exportUrl);
//         const prdText = response.data;

//         // 2. FETCH CONTEXT FROM CHROMADB
//         let codeContext = "No matching existing code found.";
//         try {
//             const collection = await ChromaClient.getCollection({
//                 name: "coinpedia_codebase_v2"
//             });

//             const searchResults = await collection.query({
//                 queryTexts: [prdText],
//                 nResults: 8,
//                 where: { "project": "APP_COINPEDIA" },
//                 include: ["documents", "metadatas"]
//             });

//             if (searchResults.documents[0].length > 0) {
//                 codeContext = searchResults.documents[0].map((doc, i) => {
//                     const path = searchResults.metadatas[0][i]?.path || searchResults.ids[0][i];

//                     // ONLY include this code in the context if it exists in the current fileStructure
//                     if (fileStructure.includes(path)) {
//                         return `FILE: ${path}\nCONTENT:\n${doc}`;
//                     }
//                     return null;
//                 }).filter(Boolean).join("\n\n---\n\n");
//             }
//         } catch (dbError) {
//             console.warn("ChromaDB retrieval failed:", dbError.message);
//         }

//         // 3. FETCH SONAR DATA
//         const sonarData = await fetchAllSonarData(sonarProjectKey);

//         // 4. GENERATE AI PROMPT (Using fileStructure parameter)
//         const prompt = `
//         <role>
//         You are a Senior Fullstack Architect. Generate a roadmap for ${projectType}.
//         </role>

//         <task_instructions>
//         1. FILE-CENTRIC GROUPING: You MUST group all tasks related to the same 'file_path' into a SINGLE phase. Do not create multiple phases for the same file.
//         2. ACTION CONSOLIDATION: If a file contains both existing code updates and new feature logic, mark the action as "EXISTING".
//         3. LOGICAL ORDERING: Order the phases by implementation priority (e.g., Database/API first, then UI components, then Page integration).
//         4. PATH ACCURACY: Ensure every 'file_path' exists in <file_structure> or follows its pattern exactly.
//         </task_instructions>

//         <json_schema>
//         {
//         "phases": [
//             {
//             "file_path": "string (unique)",
//             "phase_title": "string (descriptive name for all work in this file)",
//             "action": "EXISTING | NEW",
//             "total_estimated_hours": number,
//             "tasks": [
//                 { 
//                 "task_name": "string", 
//                 "technical_description": "string", 
//                 "estimated_hours": number 
//                 }
//             ]
//             }
//         ]
//         }
//         </json_schema>

//         <input_data>
//         <prd_document>${prdText}</prd_document>
//         <file_structure>${fileStructure}</file_structure> 
//         <existing_code_context>${codeContext}</existing_code_context>
//         <sonar_report>${JSON.stringify(sonarData)}</sonar_report>
//         </input_data>

//         <output_constraint>
//         Return ONLY raw JSON. No markdown.
//         </output_constraint>
//         `;

//         const result = await model.generateContent(prompt);
//         const aiResponse = result.response.text();

//         const cleanJson = aiResponse.replace(/```json|```/g, "").trim();
//         return JSON.parse(cleanJson);

//     } catch (error) {
//         console.error("AI Agent Error:", error.message);
//         throw new Error("Failed to process roadmap.");
//     }
// };

// exports.analyzePRD = async (docUrl, fileStructure, sonarProjectKey, projectType) => {
//     try {
//         const docId = getDocId(docUrl);
//         if (!docId) throw new Error("Invalid Google Doc URL");

//         // Fetch PRD Text
//         const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
//         const response = await axios.get(exportUrl);
//         const prdText = response.data;

//         // Fetch Aggregated Sonar Data (Handles single string or multi-key object)
//         const sonarData = await fetchAllSonarData(sonarProjectKey);

//         const prompt = `
//             <role>
// You are a Senior Fullstack Architect and Technical Project Manager. Generate a high-fidelity implementation roadmap for ${projectType}.
// </role>

// <task_instructions>
// 1. RELEVANCY FILTER: Only include files from <file_structure> that are directly impacted by the <prd_document> requirements or <sonar_report> issues.
// 2. STRICT PATHING: Use EXACT paths from <file_structure>. For [NEW] files, follow existing naming conventions (e.g., src/custom-components/).
// 3. WEIGHTED ESTIMATION: Calculate 'estimated_hours' based on these rules:
//    - PRD Feature: Base 2-4 hours depending on UI/Logic complexity.
//    - Sonar "CRITICAL/BLOCKER": Add 3-5 hours (requires deep refactor/testing).
//    - Sonar "MAJOR": Add 1-2 hours.
//    - Sonar "MINOR/INFO": Add 0.5 hours (quick fix).
// 4. LOGICAL SEQUENCING: Order phases by Build Dependencies (Core Logic -> API -> UI Component -> Page Integration).
// 5. DATA SYNERGY: Combine PRD feature requests and SonarQube technical debt into a single unified task list for the relevant file.
// </task_instructions>

// <json_schema>
// {
//   "phases": [
//     {
//       "phase_number": number,
//       "phase_title": "string",
//       "file_path": "string",
//       "action": "EXISTING | NEW",
//       "complexity_score": "1-10",
//       "phase_tag": "string (e.g., API-REST, UI-AUTH)",
//       "tasks": [
//         {
//           "task_name": "string",
//           "technical_description": "string",
//           "estimated_hours": number,
//           "priority": "High|Medium|Low",
//           "status": "pending"
//         }
//       ]
//     }
//   ]
// }
// </json_schema>

// <input_data>
// <prd_document>${prdText}</prd_document>
// <sonar_report>${JSON.stringify(sonarData)}</sonar_report>
// <file_structure>${fileStructure}</file_structure>
// </input_data>

// <output_constraint>
// Return ONLY raw JSON. No markdown backticks. No conversational text.
// </output_constraint>
//         `;

//         const result = await model.generateContent(prompt);
//         const aiResponse = result.response.text();

//         // Clean and parse the JSON
//         const cleanJson = aiResponse.replace(/```json|```/g, "").trim();
//         return JSON.parse(cleanJson);

//     } catch (error) {
//         console.error("AI Agent Error:", error.message);
//         throw new Error("Failed to process roadmap. Check API keys and Google Doc permissions.");
//     }
// };