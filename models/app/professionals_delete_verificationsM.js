// MOVED (2026-09-17): the real schema now lives in
// src/modules/professionals-account-settings/professionals-account-settings.models.ts (see that
// file's own doc comment for why - genuine model colocation without a second `mongoose.model()`
// registration for 'cln_professionals_delete_verifications'). This file stays as a passthrough so
// legacy `setting.js` and any other call site keep working unchanged.
module.exports = require('../../src/modules/professionals-account-settings/professionals-account-settings.models').ProfessionalsDeleteVerificationsM
