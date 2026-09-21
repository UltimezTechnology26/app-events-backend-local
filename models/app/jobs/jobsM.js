// MOVED (2026-09-17): the real schema now lives in src/modules/jobs/jobs.models.ts (see that
// file's own doc comment for why - genuine model colocation without a second `mongoose.model()`
// registration for 'cln_jobs'). This file stays as a passthrough so every other call site
// (`require('models/app/jobs/jobsM')`) keeps working unchanged.
module.exports = require('../../../src/modules/jobs/jobs.models').JobsM
