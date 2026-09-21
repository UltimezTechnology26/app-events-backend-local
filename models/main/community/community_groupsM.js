// MOVED (2026-09-18): the real schema now lives in
// src/modules/community-admin/community-admin.models.ts (see that file's own doc comment for why
// - genuine model colocation without a second `mongoose.model()` registration for
// 'cln_main_community_groups'). This file stays as a passthrough so every legacy
// `require('models/main/community/community_groupsM')` call site keeps working unchanged.
module.exports = require('../../../src/modules/community-admin/community-admin.models').CommunityGroupsM
