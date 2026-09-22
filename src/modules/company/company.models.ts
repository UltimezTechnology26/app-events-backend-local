// modules/company/company.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyM`'s schema now lives here, ported verbatim from
// the legacy `models/app/company/companyM.js` (every field, every `.index()` call plus its own
// extensive doc comments explaining which indexes are live vs. already-removed-as-dead by a prior
// engagement, the `pre('save')` auto-increment hook). This is the core Company identity model -
// `company` is its designated owner, mirroring `professionals` owning `ProfessionalM` (both are
// the self-service core module for their respective domain).
//
// `models/app/company/companyM.js` was reduced to a one-line passthrough so every other consumer
// (company_admin, company_acquisitions, company_claim_requests, company_holdings, company_manual,
// company_overview, company_products, company_revenue, company_watchlist, funding, jobs, partners,
// team-members, work-experience, and any remaining legacy consumer) keeps resolving to the exact
// same compiled model object - same reverse-shim pattern already applied to every other colocated
// model in this migration (see professionals.models.ts's own doc comment for the general
// reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const companySchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, unique: true, index: true },
  sub_admin_row_id: { type: Number, default: 0 },
  // 0: not-claim function - Self Created, 1: Pending, 2: Claimed
  claim_status: { type: Number, default: 0 },
  company_name: { type: String, required: true, index: true },
  company_id: { type: String, unique: true, required: true, index: true },
  company_email_id: { type: String, index: true },
  company_logo: { type: String },
  about_company: { type: String },
  website_link: { type: String },
  contact_number: { type: String },
  established_in: { type: Date },
  nft_wallet_address: { type: String },
  // index removed: no query anywhere filters/sorts on this field alone — only ever read/projected
  // for display or profile-completeness scoring (confirmed via full-codebase search).
  describe_in_one_line: { type: String },
  main_business_model_id: { type: Number, index: true },
  business_model_id: { type: Object },
  // index removed: never queried alone anywhere in the codebase (only appears in the schema and an
  // unrelated BigQuery export mapping) — confirmed dead, not just unused-in-window.
  investor_model_id: { type: Number },
  country_id: { type: Number, index: true },
  // index removed: every occurrence in the codebase is a $lookup localField, a $project, or a
  // write-side assignment — never a $match/find/sort filter.
  country_mobile_id: { type: Number },
  company_location: { type: String, index: true },
  city: { type: String },
  state: { type: String },
  longitude: { type: String },
  latitude: { type: String },
  // in USD
  company_valuation: { type: Number },
  company_size_row_id: { type: Number },
  investor_category_row_id: { type: Number },
  approval_sub_admin_row_id: { type: Number },
  reason_rejected: { type: String },
  rejected_date_n_time: { type: Date },
  disable_reason: { type: String },
  disabled_date_n_time: { type: Date },
  updated_date_n_time: { type: Date },
  // Added Part 3 §7 Phase B step 8, confirmed with the user before adding: .explain() showed the
  // default company_list sort ('recent', used whenever no sort_by param is passed) had zero index
  // support, paying for an in-memory SORT stage (~171ms) unlike the view_counts/company_name sort
  // options (16-19ms, both index-order scans) — this matches that same simple single-field
  // pattern, not a 3-field compound.
  created_date_n_time: { type: Date, index: true },
  // 0: pending, 1: approved, 2: rejected
  approval_status: { type: Number, default: 0 },
  // 0: disable, 1: enable
  active_status: { type: Number, default: 1 },
  // 1: Uploaded
  bulk_upload_status: { type: Number, default: 0 },
  view_counts: { type: Number, index: true },
  regularities_details: [
    {
      regulatory_bodies_ids: { type: Number },
    },
  ],
  basic_details_score: { type: Number, default: 0 },
  seo_details_score: { type: Number, default: 0 },
  social_media_score: { type: Number, default: 0 },
  owned_product_score: { type: Number, default: 0 },
  team_detail_score: { type: Number, default: 0 },
  job_opening_score: { type: Number, default: 0 },
  funding_score: { type: Number, default: 0 },
  revenue_score_score: { type: Number, default: 0 },
  investment_score: { type: Number, default: 0 },
  faq_score: { type: Number, default: 0 },
  holding_crypto_score: { type: Number, default: 0 },
  profile_score: { type: Number, default: 0 },
  updated_by: { type: String, enum: ['user', 'subadmin', 'admin'], default: null },
  updated_by_row_id: { type: Number, default: null },
  // Advisory-only duplicate-name flag (user-requested, 2026-09-22): set when an admin creates a
  // company whose name exactly or closely matches an existing one, per their own explicit choice
  // to proceed anyway rather than being blocked. Never restricts creation - purely bookkeeping for
  // a later "Possible Duplicates" review queue. `possible_duplicate_of` holds the matched
  // company_row_id(s) at the time of creation; undefined/absent on every company created before
  // this feature and on every company with no match found.
  possible_duplicate_of: { type: [Number], default: undefined },
  duplicate_review_status: { type: String, enum: ['pending', 'confirmed_distinct', 'merged'], default: undefined },
})

companySchema.index({ approval_status: 1, active_status: 1 })
// Removed: { approval_status: 1, active_status: 1, followers_count: -1 } — `followers_count` is
// not a schema field and is never written anywhere - it only ever exists as a computed $addFields
// value sourced from cln_company_followers, so this index could never structurally serve any query.
companySchema.index({ approval_status: 1, active_status: 1, company_valuation: -1 })
companySchema.index({ approval_status: 1, active_status: 1, business_model_id: 1 })
// Removed: { approval_status: 1, active_status: 1, company_name: "text", company_id: "text" } —
// confirmed zero `$text` operator usage anywhere in the codebase - all search functionality uses
// $regex instead, so this text index was never reachable.
companySchema.index({ main_business_model_id: 1, active_status: 1, approval_status: 1 })
companySchema.index({ _id: 1, active_status: 1, approval_status: 1 })
// Removed: { _id: 1, approval_status: 1, active_status: 1, country_id: 1 } — no query anywhere
// combines all four fields; the real country-filter query path omits `_id` entirely, so this
// compound was never selectable.
companySchema.index({ _id: 1, approval_status: 1, active_status: 1, company_location: 1 })
// Removed: { latitude: 1, longitude: 1 } — the geo radius-search feature is real and active
// (services/company/front_page.ts), but it filters on computed lat_num/lon_num fields produced by
// $addFields+$convert, not the raw latitude/longitude fields - this index could never be selected
// by the query planner for that pipeline.

companySchema.index({ company_id: 1 }, { unique: true })
companySchema.index({ user_row_id: 1 }, { unique: true })
companySchema.index({ company_name: 1 })
companySchema.index({ business_model_id: 1 })
// country_id and main_business_model_id already have field-level `index: true` above — the two
// explicit declarations that used to be here were exact duplicates of those, confirmed via
// `getIndexes()` showing two indexes on the same single field.
companySchema.index({ _id: 1, active_status: 1 })

companySchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_lists')
  }
  next()
})

export const CompanyM = mongoose.model('cln_company_lists', companySchema, 'cln_company_lists')
