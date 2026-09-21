// modules/company_acquisitions/company_acquisitions.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyAcquisitionsM`'s schema now lives here, ported
// verbatim from the legacy `models/app/company/companyAcquisitionsM.js` (every field, both
// `.index()` calls, the `pre('save')` auto-increment hook). This model is genuinely owned by this
// module - confirmed via a repo-wide grep that it has no other consumer anywhere in src/modules.
//
// `models/app/company/companyAcquisitionsM.js` was reduced to a one-line passthrough so any other
// (legacy) call site keeps resolving to the exact same compiled model object - same reverse-shim
// pattern already applied to every professionals-* model (see professionals.models.ts's own doc
// comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const companyAcquisitionsSchema = new mongoose.Schema({
  _id: { type: Number },
  // 1: registered company, 2: manual/unclaimed entry
  acquirer_registered_type: { type: Number, index: true },
  acquirer_company_row_id: { type: Number, index: true },
  acquired_registered_type: { type: Number, index: true },
  acquired_company_row_id: { type: Number, index: true },
  acquisition_date: { type: Date },
  acquisition_price: { type: Number },
  facilitators: { type: String },
  stake_acquired_percent: { type: Number },
  acquisition_multiple: { type: Number },
  // 0: Pending, 1: Approved, 2: Rejected
  verified_status: { type: Number, default: 0 },
  verified_on: { type: Date },
  reject_type: { type: Number },
  reject_reason: { type: String },
  // 1: admin, 2: company owner
  submitted_by_type: { type: Number },
  // set only when submitted_by_type is 2 — the submitting company, so the OTHER side (the
  // counterparty) can be identified for approval purposes
  submitted_by_company_row_id: { type: Number, index: true },
  date_n_time: { type: Date },
})

companyAcquisitionsSchema.index({ acquirer_company_row_id: 1, acquirer_registered_type: 1, verified_status: 1 })
companyAcquisitionsSchema.index({ acquired_company_row_id: 1, acquired_registered_type: 1, verified_status: 1 })

companyAcquisitionsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_acquisitions')
  }
  next()
})

export const CompanyAcquisitionsM = mongoose.model('cln_company_acquisitions', companyAcquisitionsSchema, 'cln_company_acquisitions')
