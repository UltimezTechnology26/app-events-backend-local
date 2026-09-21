// MOVED (2026-09-17): the real schema now lives in
// src/modules/team-members/team-members.models.ts (see that file's own doc comment for why -
// genuine model colocation without a second `mongoose.model()` registration for
// 'cln_company_employees_requests'). This file stays as a passthrough so every other call site
// (including `company`) keeps working unchanged.
module.exports = require('../../../src/modules/team-members/team-members.models').EmployeesRequestsM
