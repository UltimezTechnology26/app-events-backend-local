// modules/community-admin/community-admin.models.ts
//
// REAL SCHEMA COLOCATION, same convention proven for `academy-admin.models.ts`:
// `CommunityGroupsM`'s schema now lives here, ported verbatim (every field, every `.index()`
// call, the `pre('save')` auto-increment hook) from legacy `models/main/community/
// community_groupsM.js`.
//
// `CommunityGroupsM` has a wide legacy consumer list confirmed via grep (`controllers/
// admin_panel/main/community/groups.js`, `controllers/main/community/posts.js`,
// `controllers/main/community/pro_batch.js`, and the already-migrated
// `professionals-community.controller.ts`, which requires it directly rather than owning it) -
// `models/main/community/community_groupsM.js` reduced to a one-line passthrough.
//
// CONFIRMED PRE-EXISTING BUG, preserved as-is (flagged, not fixed): the admin controller's own
// `/add_n_update_details` (ported into `.groups.service.ts`) manually calls
// `getCollectionID('cln_community_groups')` and assigns `_id` BEFORE calling `.save()` - this
// bypasses the `pre('save')` hook below entirely (its `if (!this._id)` guard never fires on that
// path), so new groups actually get their `_id` from the `cln_community_groups` counter, NOT the
// `cln_main_community_groups` counter this hook uses. Two different, never-synced counters exist
// for the same collection; only the controller's own counter is ever exercised in practice today.
// Not fixed here - changing either counter's identifier is a live-data-affecting decision needing
// explicit sign-off, not something to silently correct mid-migration.
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- matches this repo's existing
// TS-module convention for this helper (see academy-admin.models.ts)
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const communityGroupSchema = new mongoose.Schema({
  _id: { type: Number },
  name: { type: String, required: true, trim: true },
  hashtag: { type: String, required: true, unique: true, trim: true },
  icon: { type: String },
  date: { type: Date, default: Date.now },
})

communityGroupSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_main_community_groups')
  }
  next()
})

communityGroupSchema.index({ _id: 1, name: 1 })
communityGroupSchema.index({ _id: 1, hashtag: 1 })

export const CommunityGroupsM = mongoose.model('cln_main_community_groups', communityGroupSchema, 'cln_main_community_groups')
