// MOVED (2026-09-17): the real schema now lives in
// src/modules/professionals-academy/professionals-academy.models.ts (see that file's own doc
// comment for why - genuine model colocation without a second `mongoose.model()` registration for
// 'cln_academy_courses_certificates'). This file stays as a passthrough so legacy
// `controllers/main/users.js` and any other call site keep working unchanged.
module.exports = require('../../../src/modules/professionals-academy/professionals-academy.models').CoursesCertificatesM
