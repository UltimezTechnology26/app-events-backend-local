// modules/professionals/professionals.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17, pilot for the Professionals migration's model-colocation
// convention): `ProfessionalM`'s schema now lives here, ported verbatim (every field, every
// `.index()` call, the `pre('save')` auto-increment hook) from the legacy `models/app/professionalsM.js`.
//
// The earlier attempt at this (see git history / plan doc) redeclared the schema here directly
// AND left the legacy file's own `mongoose.model(...)` call in place - two `mongoose.model()` calls
// for the same collection name in one process always throws `OverwriteModelError`, regardless of
// import order, and legacy `controllers/admin_panel/app/user.js` (among others) still
// `require()`s `models/app/professionalsM` directly and stays live for this migration's whole
// `_v2` parallel-verification window - it can't simply stop importing that path.
//
// Resolution: this file is now the ONLY place the schema is declared. `models/app/professionalsM.js`
// was reduced to a one-line passthrough (`module.exports = require('../../src/modules/professionals/
// professionals.models').ProfessionalM`), so every legacy call site gets the exact same compiled
// model object - Node's require cache guarantees a `require()` of either path resolves to the
// same singleton, so there's only ever one schema/model registration. This pattern (legacy JS
// `require()`-ing a TS module directly) is already proven in this repo via `ts-node/register` -
// see `controllers/admin_panel/app/user.js`'s own imports from `src/modules/work-experience` and
// `src/modules/funding`, just not yet applied to a model.
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- matches this repo's existing
// TS-module convention for this helper (see funding.service.ts, company_watchlist.service.ts)
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const professionalSchema = new mongoose.Schema({
  _id: { type: Number },
  referral_row_id: { type: Number },
  referral_user_name: { type: String },
  sub_admin_row_id: { type: Number, default: 0 },
  // 0: not-claim function - Self Created, 1: Pending, 2: Claimed
  claim_status: { type: Number, default: 0 },
  user_name: { type: String, sparse: true, index: true },
  full_name: { type: String, index: true },
  about_in_one_line: { type: String },
  // 1: male, 2: female, 3: others
  gender: { type: Number, default: 0 },
  email_id: { type: String, index: true },
  email_verify_status: { type: Boolean, default: false },
  mobile_number: { type: String },
  country_id: { type: Number, index: true },
  country_mobile_id: { type: Number, index: true },
  location: { type: String },
  area: { type: String },
  city: { type: String },
  country_name: { type: String },
  state: { type: String },
  longitude: { type: String },
  latitude: { type: String },
  location_country: { type: String },
  // 1: private, 2: public
  account_visible_type: { type: Number, default: 2 },
  designation_id: { type: Object, index: true },
  // 0: disabled, 1: enabled, 2: deleted
  login_status: { type: Number, default: 1 },
  // 0: pending, 1: approved, 2: rejected
  approval_status: { type: Number, default: 0 },
  reason_rejected: { type: String },
  rejected_date_n_time: { type: Date },
  deleted_date_n_time: { type: Date },
  view_counts: { type: Number },
  created_date_n_time: { type: Date },
  wallet_address: { type: String },
  // 0: vcf disable, 1: vcf enable
  vcf_status: { type: Number, default: 0 },
  user_bio: { type: String },
  looking_for_id: { type: Object },
  pro_batch: { type: Boolean, default: false },
  professional_profile_score: { type: Number, default: 0 },
  seo_details_score: { type: Number, default: 0 },
  social_media_score: { type: Number, default: 0 },
  academy_score: { type: Number, default: 0 },
  community_score: { type: Number, default: 0 },
  professional_detail_score: { type: Number, default: 0 },
  investment_score: { type: Number, default: 0 },
  award_score: { type: Number, default: 0 },
  faq_score: { type: Number, default: 0 },
  profile_score: { type: Number, default: 0 },
  updated_by: { type: String, enum: ['user', 'subadmin', 'admin'], default: null },
  updated_by_row_id: { type: Number, default: null },
  updated_date_n_time: { type: Date },
  disabled_date_n_time: { type: Date },
})

// Essential indexes for all user queries
professionalSchema.index({ _id: 1, user_name: 1, full_name: 1 })
professionalSchema.index({ _id: 1, email_id: 1 })
professionalSchema.index({ full_name: 1, user_name: 1 })
professionalSchema.index({ _id: 1, login_status: 1 })

// Compound indexes for optimized queries
professionalSchema.index({ approval_status: 1, login_status: 1 })
professionalSchema.index({ approval_status: 1, login_status: 1, _id: 1 })
professionalSchema.index({ approval_status: 1, login_status: 1, designation_id: 1 })
professionalSchema.index({ approval_status: 1, login_status: 1, user_name: 1, full_name: 1 })
professionalSchema.index({ approval_status: 1, login_status: 1, email_id: 1 })
// For user suggestions
professionalSchema.index({ login_status: 1, user_name: 1, full_name: 1 })
// login_status-led: serves $or branches that constrain login_status without approval_status
// (e.g. admin_panel/app/user.js list/count filters)
professionalSchema.index({ login_status: 1, approval_status: 1 })

// Text search indexes for regex search optimization
professionalSchema.index({ user_name: 'text', full_name: 'text' })
professionalSchema.index({ approval_status: 1, login_status: 1, user_name: 'text' })
professionalSchema.index({ approval_status: 1, login_status: 1, full_name: 'text' })
// For user suggestions
professionalSchema.index({ approval_status: 1, login_status: 1, full_name: 'text', email_id: 'text' })

professionalSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals')
  }
  next()
})

export const ProfessionalM = mongoose.model('cln_professionals', professionalSchema, 'cln_professionals')

// ProfessionalSocialLinksM, ProfessionalSeoDetailsM, ProfessionalProfileImagesM are owned by their
// own dedicated modules (professionals-social-links, professionals-seo, professionals-profile-images
// respectively, per the plan's model-to-module mapping) - colocated for real there, 2026-09-17.
// Re-exported here via the same stable top-level path (which now resolves through each owner's own
// legacy shim) since this core module still needs to read/write all three as part of its own
// combined admin create/update route - re-importing the top-level path rather than reaching into a
// sibling module's file directly.
import ProfessionalSocialLinksM from '../../../models/app/professionals_social_linksM'
import ProfessionalSeoDetailsM from '../../../models/app/professionals_seo_detailsM'
import ProfessionalProfileImagesM from '../../../models/app/professionals_profile_imagesM'

export { ProfessionalSocialLinksM, ProfessionalSeoDetailsM, ProfessionalProfileImagesM }

// REAL SCHEMA COLOCATION (2026-09-17): ProfessionalCreatedByAdminM and ProfessionalDisabledM are
// colocated here directly (not split into their own modules) since this core `professionals`
// module is their only consumer anywhere in src/modules - confirmed via a repo-wide grep before
// moving them. Ported verbatim from `models/app/professionals_created_by_adminM.js` and
// `models/app/professionals_disabledM.js`; both legacy files reduced to a one-line passthrough.
const professionalCreatedByAdminSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, required: true, index: true },
  // 1: admin, 2: sub admin
  admin_sub_admin_type: { type: Number, required: true, default: 1, index: true },
  sub_admin_row_id: { type: Number },
  // 1: pending, 2: account claimed
  claim_status: { type: Number },
  claim_verify_code: { type: String },
  date_n_time: { type: Date },
})

professionalCreatedByAdminSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_created_by_admins')
  }
  next()
})

export const ProfessionalCreatedByAdminM = mongoose.model('cln_professionals_created_by_admins', professionalCreatedByAdminSchema, 'cln_professionals_created_by_admins')

const professionalDisabledSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, index: true },
  disabled_reason: { type: String },
  date_n_time: { type: Date },
})

professionalDisabledSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_disables')
  }
  next()
})

export const ProfessionalDisabledM = mongoose.model('cln_professionals_disables', professionalDisabledSchema, 'cln_professionals_disables')
