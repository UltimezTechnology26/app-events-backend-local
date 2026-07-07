const { ChromaClient } = require('chromadb');

async function ping() {
    const client = new ChromaClient({ host: "127.0.0.1", port: 8000 });
    try {
        const version = await client.version();
        console.log("🟢 Server reached! Version:", version);
        const collections = await client.listCollections();
        console.log("📁 Current collections:", collections);
    } catch (e) {
        console.error("🔴 Connection Failed:", e.message);
    }
}
ping();