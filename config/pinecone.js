const { Pinecone } = require('@pinecone-database/pinecone');

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

// Reference your existing index
const index = pc.index(process.env.PINECONE_INDEX_NAME);

module.exports = { pc, index };