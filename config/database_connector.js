const mongoose = require('mongoose')
const MARKET_DB_URL = process.env.MARKET_DB_URL
const LIVE_MAIN_DB_URL = process.env.LIVE_MAIN_DB_URL

// Environment-specific connection configurations
const getDatabaseConfig = (connectionName) => {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        return {
            maxPoolSize: 20,           // Optimized for M30 resources
            minPoolSize: 6,            // Keep connections ready
            maxIdleTimeMS: 45000,     // Longer idle time for production
            serverSelectionTimeoutMS: 8000,  // More time for failover
            socketTimeoutMS: 60000,   // Longer timeout for production queries
            bufferCommands: false,
            heartbeatFrequencyMS: 10000, // Keep connections alive
        };
    } else {
        return {
            maxPoolSize: 12,           // Moderate for Flex plan
            minPoolSize: 2,            // Fewer connections for development
            maxIdleTimeMS: 20000,     // Shorter idle time for development
            serverSelectionTimeoutMS: 5000,  // Standard timeout
            socketTimeoutMS: 30000,   // Shorter timeout for development
            bufferCommands: false,
            heartbeatFrequencyMS: 5000,
        };
    }
};

const setNewConnection = (uri, connectionName) => {
    const config = getDatabaseConfig(connectionName);
    const environment = process.env.NODE_ENV || 'development';

    const db = mongoose.createConnection(uri, config)

    db.on('connected', () => {
        console.log(`✅ ${connectionName} connected (${environment}) with optimized pooling`);
        console.log(`📊 ${connectionName} Pool Config: max=${config.maxPoolSize}, min=${config.minPoolSize}`);
    });

    db.on('error', function (error) {
        console.log(`❌ MongoDB :: connection ${connectionName} error:`, error.message);
        db.close().catch(() => console.log(`MongoDB :: failed to close connection ${connectionName}`));
    });

    db.on('disconnected', () => {
        console.log(`🔌 ${connectionName} disconnected`);
    });

    return db
}

const marketDB = setNewConnection(MARKET_DB_URL, 'MarketDB')

// Graceful shutdown for both connections
process.on('SIGINT', async () => {
    console.log('🔄 Closing all database connections...');

    try {
        await marketDB.close();
        console.log('✅ All database connections closed successfully');
    } catch (error) {
        console.error('❌ Error closing database connections:', error);
    }

    process.exit(0);
});

// Monitor connection status in development
if (process.env.NODE_ENV !== 'production') {
    setInterval(() => {
        const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
        console.log(`📊 MarketDB Status: ${states[marketDB.readyState]}`);
    }, 30000);
}

module.exports = { marketDB }
