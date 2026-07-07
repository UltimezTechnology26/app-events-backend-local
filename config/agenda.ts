const Agenda = require('agenda');

interface AgendaConfig {
    db: {
        address: string;
        collection: string;
    };
    processEvery: string;
    maxConcurrency: number;
}

const agendaConfig = {
    db: {
        address: process.env.LIVE_MAIN_DB_URL,
        collection: 'jobs'
    },
    processEvery: '10 seconds',
    maxConcurrency: 2
};

const agenda = new Agenda(agendaConfig);

module.exports = agenda;



