// MOVED (2026-09-17): the real schema now lives in
// src/modules/professionals-community/professionals-community.models.ts (see that file's own doc
// comment for why - genuine model colocation without a second `mongoose.model()` registration for
// 'cln_community_21days_challenges'). This file stays as a passthrough so legacy
// `admin_panel/main/community/21dayschallenge.js` and any other call site keep working unchanged.
module.exports = require('../../../src/modules/professionals-community/professionals-community.models').Community21DaysChallengeM
