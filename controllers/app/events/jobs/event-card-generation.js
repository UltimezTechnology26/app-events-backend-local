const { generateEventCardImage } = require('./event-card-helper');

// controllers/main/academy/jobs/eventCardGeneration.js
require('dotenv').config()

module.exports = (agenda) => {
    agenda.define('generate event card', async (job) => {
        await generateEventCardImage(job.attrs.data);
    });
};
