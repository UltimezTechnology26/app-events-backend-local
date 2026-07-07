const { ChromaClient } = require('chromadb');

async function getFullCode(filePath) {
    const client = new ChromaClient({ host: "127.0.0.1", port: 8000 });

    try {
        const collection = await client.getCollection({ name: "coinpedia_codebase_v2" });

        const response = await collection.get({
            ids: [filePath],
            include: ["documents", "metadatas"] // Explicitly include the full document text
        });

        if (response.documents.length > 0) {
            console.log(`\n📄 FULL CODE FOR: ${filePath}`);
            console.log("------------------------------------------");
            console.log(response.documents[0]); 
            console.log("------------------------------------------");
            console.log(`📏 Total Length: ${response.documents[0].length} characters`);
        } else {
            console.log(`❌ File not found: ${filePath}`);
        }

    } catch (error) {
        console.error("❌ Error retrieving from ChromaDB:", error);
    }
}

// Example: Pass the relative path as it was stored in the DB
const targetFile = process.argv[2] || "src\\app\\api\\common\\submit_issues\\route.ts";
getFullCode(targetFile);