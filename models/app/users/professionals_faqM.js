// MOVED (2026-09-17): the real schema now lives in
// src/modules/professionals-faq/professionals-faq.models.ts (see that file's own doc comment for
// why - genuine model colocation without a second `mongoose.model()` registration for
// 'cln_professionals_faq_lists'). This file stays as a passthrough so every other call site
// (link_pages.js, setting.js, pro_batch.js, app_helper.js, and any remaining legacy consumer)
// keeps working unchanged.
module.exports = require('../../../src/modules/professionals-faq/professionals-faq.models').ProfessionalsFaqM
