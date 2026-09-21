// modules/professionals-manual-retrievals/professionals-manual-retrievals.models.ts
//
// Phase C of the Professionals migration (see plan doc). Ports
// controllers/admin_panel/app/user/manual_users.js (1,423 lines, 8 routes) — the admin panel's
// manual-retrieval professional record workflow (pending/approved/rejected review, individual
// detail, reject/revoke/delete actions).
//
// REAL SCHEMA COLOCATION (2026-09-17): `ProfessionalsManualRetrievalsM`'s schema now lives here,
// ported verbatim from the legacy `models/app/users/professionals_manual_retrievalsM.js` (every
// field including its own commented-out dead fields, every `.index()` call, `versionKey: false`,
// the `pre('save')` auto-increment hook).
//
// `models/app/users/professionals_manual_retrievalsM.js` was reduced to a one-line passthrough so
// every other still-legacy call site (`setting.js`, `work_experiences.js`, `admin_panel/app/
// user.js`, `funding`, `team-members`, `work-experience`) keeps resolving to the exact same
// compiled model object — same reverse-shim pattern already applied to every other
// professionals-* model (see professionals.models.ts's own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const professionalsManualRetrievalsSchema = new mongoose.Schema(
  {
    _id: { type: Number },
    // 1: male, 2: female, 3: others
    gender: { type: Number, default: 0 },
    full_name: { type: String, index: true },
    email_id: { type: String, index: true },
    mobile_number: { type: String },
    profile_image: { type: String },
    // work_position: { type: String },
    // company_type: { type: Number }, // 1. registered 2. Manual
    // company_row_id: { type: Number },
    user_link: { type: String },
    medium: { type: String },
    twitter: { type: String },
    reddit: { type: String },
    rss_feed: { type: String },
    created_on: { type: Date },
    updated_on: { type: Date },
    used_counts: { type: Number, default: 0, index: true },
    main_user_row_id: { type: Number, index: true },
    used_types: { type: Object },
    // 0: pending, 1: approved, 2: rejected, 3: self registered
    approval_status: { type: Number, default: 0 },
    approval_date: { type: Date },
    approval_sub_admin_row_id: { type: Number },
    reject_type: { type: Number },
    rejected_reason: { type: String },
  },
  { versionKey: false },
)

professionalsManualRetrievalsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_manual_retrievals')
  }
  next()
})

professionalsManualRetrievalsSchema.index({ full_name: 1, email_id: 1 })
professionalsManualRetrievalsSchema.index({ full_name: 'text', email_id: 'text' })
professionalsManualRetrievalsSchema.index({ _id: 1, full_name: 1, email_id: 1 })

export const ProfessionalsManualRetrievalsM = mongoose.model('cln_professionals_manual_retrievals', professionalsManualRetrievalsSchema, 'cln_professionals_manual_retrievals')
