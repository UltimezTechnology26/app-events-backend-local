// modules/company_manual/company_manual.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyManualRetrievalsM`'s schema now lives here, ported
// verbatim from the legacy `models/app/company/company_manual_retrievalsM.js` (every field, the
// live index plus its own extensive doc comment listing the indexes already confirmed dead and
// removed by a prior engagement, `versionKey: false`, the `pre('save')` auto-increment hook). This
// model is genuinely owned by this module - `company`, `company_holdings`, `company_products`,
// `company_acquisitions`, `funding`, and `work-experience` only ever read/reference a manual
// company stub, never own the schema, confirmed via a repo-wide grep.
//
// `models/app/company/company_manual_retrievalsM.js` was reduced to a one-line passthrough so
// every other call site keeps resolving to the exact same compiled model object - same
// reverse-shim pattern already applied to every professionals-* model (see
// professionals.models.ts's own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const companyManualRetrievalsSchema = new mongoose.Schema(
  {
    _id: { type: Number },
    // 1: Professional, 2: Events, 3: Funding
    created_from_type: { type: Number, index: true },
    company_name: { type: String, index: true },
    // unique
    company_email_id: { type: String, index: true },
    company_logo: { type: String },
    // unique
    website_link: { type: String },
    medium: { type: String },
    twitter: { type: String },
    reddit: { type: String },
    feed_url: { type: String },
    // index removed: never queried on this model (this field IS indexed and used on the separate
    // companyM/cln_company_lists collection, which is a different index) — confirmed dead here.
    main_business_model_id: { type: Number },
    used_counts: { type: Number, index: true },
    // 1: funds, 2: user experience, 3:
    used_types: { type: Object },
    created_on: { type: Date },
    updated_on: { type: Date },
    // 0: pending, 1: approved, 2: rejected
    approval_status: { type: Number, default: 0 },
    approval_date: { type: Date },
    approval_sub_admin_row_id: { type: Number },
    // cln_company_lists
    main_company_row_id: { type: Number },
    reject_type: { type: Number },
    reject_reason: { type: String },
  },
  { versionKey: false },
)

// company_name already has field-level `index: true` above — the explicit single-field
// declaration that used to be here was an exact duplicate, confirmed via `getIndexes()`.
//
// Removed (all confirmed dead via full-codebase query-site search, no query anywhere uses these
// exact field combinations on this model):
//   { company_name: "text", company_id: "text" }        — zero $text usage anywhere in repo
//   { _id: 1, company_name: 1 }                          — no query combines these two without approval_status
//   { _id: 1, company_name: 1, approval_status: 1 }      — no 3-field match found
//   { main_business_model_id: 1, approval_status: 1 }    — main_business_model_id never queried on this model
//   { _id: 1, company_name: 1, approval_status: 1, created_from_type: 1 }
//   { _id: 1, approval_status: 1, created_from_type: 1 }
companyManualRetrievalsSchema.index({ company_name: 1, approval_status: 1 })

companyManualRetrievalsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_manual_retrievals')
  }
  next()
})

export const CompanyManualRetrievalsM = mongoose.model('cln_company_manual_retrievals', companyManualRetrievalsSchema, 'cln_company_manual_retrievals')
