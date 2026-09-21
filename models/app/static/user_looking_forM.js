// MOVED (2026-09-17): the real schema now lives in
// src/modules/system_settings/system_settings.models.ts (see that file's own doc comment for why -
// genuine model colocation without a second `mongoose.model()` registration for
// 'cln_static_user_looking_for_lists'). This file stays as a passthrough so every other call site
// (including `professionals`/`professionals-approvals`) keeps working unchanged.
module.exports = require('../../../src/modules/system_settings/system_settings.models').UserLookingForM
