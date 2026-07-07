require('dotenv').config()
const mongoose = require('mongoose')
const LIVE_MAIN_DB_URL = process.env.LIVE_MAIN_DB_URL

// Environment-specific connection configurations
const getDatabaseConfig = () => {
        const isProduction = process.env.NODE_ENV === 'production';

        if (isProduction) {
                return {
                        maxPoolSize: 18,
                        minPoolSize: 5,
                        maxIdleTimeMS: 30000,
                        serverSelectionTimeoutMS: 8000,
                        socketTimeoutMS: 45000,
                        bufferCommands: false,
                        heartbeatFrequencyMS: 10000,
                };
        } else {
                return {
                        maxPoolSize: 12,
                        minPoolSize: 3,
                        maxIdleTimeMS: 20000,
                        serverSelectionTimeoutMS: 5000,
                        socketTimeoutMS: 30000,
                        bufferCommands: false,

                        connectTimeoutMS: 5000,
                        heartbeatFrequencyMS: 5000,
                };
        }
};

const dbConfig = getDatabaseConfig();
const environment = process.env.NODE_ENV || 'development';

const connectDatabase = async () => {
        try {
                await mongoose.connect(LIVE_MAIN_DB_URL, dbConfig);
                console.log(`✅ MongoDB connected (${environment}) with optimized pooling`);
                console.log(`📊 Pool Config: max=${dbConfig.maxPoolSize}, min=${dbConfig.minPoolSize}`);
                return true;
        } catch (err) {
                console.log('Database connection error:', err);
                return false;
        }
};

// Export the connection function for proper awaiting
module.exports = { connectDatabase };

// Also auto-connect for backward compatibility
connectDatabase();

// Connection monitoring for performance tracking
mongoose.connection.on('connected', () => {
        const config = getDatabaseConfig();
        console.log(`✅ MongoDB connected with ${environment} configuration`);
        console.log(`🔧 Pool Size: ${config.minPoolSize}-${config.maxPoolSize} connections`);
});

mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
        console.log('🔌 MongoDB disconnected');
});

// Graceful shutdown to close connections properly
process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed through app termination');
        process.exit(0);
});

// Monitor pool status every 30 seconds (for development/debugging)
if (process.env.NODE_ENV !== 'production') {
        setInterval(() => {
                const readyState = mongoose.connection.readyState;
                const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
                console.log(`📊 MongoDB Pool Status (${environment}): ${states[readyState]}`);
        }, 30000);
}