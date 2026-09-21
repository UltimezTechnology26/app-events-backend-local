// MOVED (2026-09-17): the real schema now lives in src/modules/professionals/professionals.models.ts
// (see that file's own doc comment for why - genuine model colocation without a second
// `mongoose.model()` registration for 'cln_professionals'). This file stays as a passthrough so
// every legacy `require('models/app/professionalsM')` call site keeps working unchanged.
module.exports = require('../../src/modules/professionals/professionals.models').ProfessionalM
