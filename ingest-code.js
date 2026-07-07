const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// Target your specific index using the Host URL
const index = pc.index(process.env.PINECONE_INDEX_NAME, process.env.PINECONE_HOST);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateEmbeddingsBatch(texts, retries = 3) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

        const result = await model.batchEmbedContents({
            requests: texts.map((t) => ({
                content: { parts: [{ text: t }] },
                taskType: "RETRIEVAL_DOCUMENT",
                outputDimensionality: 3072,
            })),
        });

        return result.embeddings.map(e => e.values);

    } catch (error) {
        if (error.message.includes("429") && retries > 0) {
            console.log(`Rate limit hit. Retrying in 30s... (${retries} left)`);
            await sleep(30000);
            return generateEmbeddingsBatch(texts, retries - 1);
        }

        console.error("Embedding failed:", error.message);
        return null;
    }
}

async function getBackendFiles(dir) {
    let results = [];
    const list = await fs.readdir(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
            if (!['node_modules', '.git', 'dist', 'logs', 'uploads'].includes(file)) {
                results = results.concat(await getBackendFiles(filePath));
            }
        } else if (/\.(ts|js|json|md|env\.example)$/.test(file)) {
            results.push(filePath);
        }
    }
    return results;
}

async function ingestBackend() {
    try {
        console.log("🚀 Starting Batched Backend Ingestion...");
        const backendRoot = '.';
        const allFiles = await getBackendFiles(backendRoot);
        console.log(`🔍 Total files found: ${allFiles.length}`);

        const BATCH_SIZE = 50; // Processing 100 files at a time

        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            const batchPaths = allFiles.slice(i, i + BATCH_SIZE);
            const batchContents = [];
            const validFilePaths = [];

            // 1. Read files in this batch
            for (const filePath of batchPaths) {
                const content = await fs.readFile(filePath, 'utf-8');
                if (content.trim()) {
                    batchContents.push(content);
                    validFilePaths.push(filePath);
                }
            }

            if (batchContents.length === 0) continue;

            console.log(`📡 Fetching embeddings for batch ${Math.floor(i/BATCH_SIZE) + 1}...`);
            const vectors = await generateEmbeddingsBatch(batchContents);
            await sleep(2000);

            if (vectors) {
                const records = vectors.map((vector, index) => {
                    const filePath = validFilePaths[index];
                    const displayPath = path.relative(backendRoot, filePath);
                    const content = batchContents[index];

                    return {
                        id: `backend_${displayPath.replace(/\\/g, '_').replace(/\//g, '_')}`,
                        values: vector,
                        metadata: {
                            path: displayPath.replace(/\\/g, '/'),
                            project: 'backend',
                            extension: path.extname(filePath),
                            code: content.substring(0, 20000) // Keep metadata safe under 40KB
                        }
                    };
                });

                // 2. Upsert to Pinecone
                await index.namespace('app-events-backend').upsert({ records });
                console.log(`✅ Indexed ${records.length} files in this batch.`);
            }

            // 3. Throttle: Wait 10 seconds between batches to respect Gemini Free Tier
            if (i + BATCH_SIZE < allFiles.length) {
                console.log("⏳ Waiting 10s to respect API Rate Limits...");
                await sleep(10000);
            }
        }

        console.log("\n✨ Backend Ingestion Complete!");

    } catch (err) {
        console.error("❌ Backend Ingestion Error:", err.message);
    }
}

ingestBackend();