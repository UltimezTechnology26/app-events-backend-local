// modules/partners/partners.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `AddedToPartnersM` and `CompanyRequestsToPartnersM`'s
// schemas now live here, ported verbatim from the legacy `models/app/company/added_to_partnersM.js`
// and `models/app/company/company_requests_to_partnersM.js` (every field, every `.index()` call,
// the `pre('save')` auto-increment hooks). Both are genuinely owned by this module - `company`'s
// own read of `added_to_partnersM` is a plain lookup, not ownership, confirmed via a repo-wide grep.
//
// Both legacy files were reduced to one-line passthroughs so any other call site keeps resolving
// to the exact same compiled model objects - same reverse-shim pattern already applied to every
// professionals-* model (see professionals.models.ts's own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const addedToPartnersSchema = new mongoose.Schema({
  _id: { type: Number },
  company_row_id: { type: Number, required: true, index: true },
  date_n_time: { type: Date, required: true },
})

addedToPartnersSchema.index({ company_row_id: 1, _id: 1 })
addedToPartnersSchema.index({ company_row_id: 1, date_n_time: -1 })

addedToPartnersSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_added_to_partners')
  }
  next()
})

export const AddedToPartnersM = mongoose.model('cln_company_added_to_partners', addedToPartnersSchema, 'cln_company_added_to_partners')

const companyRequestsToPartnersSchema = new mongoose.Schema({
  _id: { type: Number },
  company_row_id: { type: Number },
  user_row_id: { type: Number },
  date_n_time: { type: Date },
  // 0: pending, 1: approved, 2: rejected
  approval_status: { type: Number, default: 0 },
  rejected_reason: { type: String },
  approval_date_n_time: { type: Date },
})

companyRequestsToPartnersSchema.index({ company_row_id: 1, user_row_id: 1 }, { unique: true })

companyRequestsToPartnersSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_requests_to_partners')
  }
  next()
})

export const CompanyRequestsToPartnersM = mongoose.model('cln_company_requests_to_partners', companyRequestsToPartnersSchema, 'cln_company_requests_to_partners')
