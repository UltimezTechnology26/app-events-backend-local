// MOVED (2026-09-17): the real schema now lives in
// src/modules/company/settings/company.settings.models.ts (see that file's own doc comment for
// why - genuine model colocation without a second `mongoose.model()` registration for
// 'cln_company_seo_details'). This file stays as a passthrough so every other call site
// (company_admin's SEO overview dashboard, the change-request module, and any remaining legacy
// consumer) keeps working unchanged.
module.exports = require('../../../src/modules/company/settings/company.settings.models').CompanySeoDetailsM
