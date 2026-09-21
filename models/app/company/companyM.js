// MOVED (2026-09-17): the real schema now lives in src/modules/company/company.models.ts (see
// that file's own doc comment for why - genuine model colocation without a second
// `mongoose.model()` registration for 'cln_company_lists'). This file stays as a passthrough so
// every other call site (company_admin and every other company_*/funding/jobs/partners/
// team-members/work-experience module, plus any remaining legacy consumer) keeps working
// unchanged.
module.exports = require('../../../src/modules/company/company.models').CompanyM
