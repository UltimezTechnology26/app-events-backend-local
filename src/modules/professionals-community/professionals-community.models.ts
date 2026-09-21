// modules/professionals-community/professionals-community.models.ts
//
// Phase K of the Professionals migration (see plan doc). Ports controllers/main/community/
// pro_batch.js's GET /details (~94-265) — the only route in that file — into a dedicated module,
// since it's real, professional-specific gamification logic (streaks, engagement stats, the
// "Pro Batch" badge), not the generic shared community-posts feature.
//
// REAL SCHEMA COLOCATION (2026-09-17): `Community21DaysChallengeM`'s schema now lives here, ported
// verbatim from the legacy `models/main/community/community_21days_challengeM.js`. The legacy file
// was reduced to a one-line passthrough so legacy `controllers/admin_panel/main/community/
// 21dayschallenge.js` (untouched, stays live) keeps resolving to the exact same compiled model
// object — same reverse-shim pattern already applied to every other colocated model in this
// migration (see professionals.models.ts's own doc comment for the general reasoning).
//
// NOT owned/colocated here (deliberately, not an oversight):
// - ProfessionalM (core identity + score fields) — owned by the core `professionals` module
//   (Phase A). Imported directly from top-level `models/` below, same as every other module that
//   reads it without owning it.
// - professionals_pointsM — already assigned to Phase G (`professionals-audit`) in the plan's
//   model-to-module mapping. Imported directly, not colocated here, so Phase G doesn't inherit an
//   ownership conflict when it's built.
// - community_postsM / community_likesM / community_commentsM — generic, shared community
//   features used across the whole app (confirmed: community_postsM alone is wired into index.js's
//   MongoDB change streams and required by 10+ unrelated controllers). Not professionals-owned;
//   imported directly, never colocated in any professionals-* module.
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const community21DaysChallengeSchema = new mongoose.Schema(
  {
    _id: { type: Number },
    user_row_id: { type: Number, required: true, index: true },
    group_ids: { type: [Number], required: true, trim: true },
    valid_status: { type: Boolean, default: false },
    released_status: { type: Boolean, default: false },
    date_n_time: { type: Date, required: true },
  },
  { versionKey: false },
)

community21DaysChallengeSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_community_21days_challenges')
  }
  next()
})

export const Community21DaysChallengeM = mongoose.model('cln_community_21days_challenges', community21DaysChallengeSchema, 'cln_community_21days_challenges')
