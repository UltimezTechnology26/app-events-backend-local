// modules/company_holdings/company_holdings.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyHoldingM`'s schema now lives here, ported verbatim
// from the legacy `models/markets/products_n_holding/company_holdingM.js` (every field, every
// `.index()` call, the `pre('save')` auto-increment hook). This model is genuinely owned by this
// module - `company`'s own read of it is a plain lookup, not ownership, confirmed via a repo-wide
// grep.
//
// `models/markets/products_n_holding/company_holdingM.js` was reduced to a one-line passthrough so
// any other call site keeps resolving to the exact same compiled model object - same reverse-shim
// pattern already applied to every professionals-* model (see professionals.models.ts's own doc
// comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const companyHoldingSchema = new mongoose.Schema({
  _id: { type: Number },
  company_type: { type: Number, required: true },
  company_row_id: { type: Number, required: true, index: true },
  // 1: approved token, 2: manual_token
  token_type: { type: Number, index: true },
  token_row_id: { type: Number, required: true, index: true },
  purchased_date: { type: Date },
  purchased_value: { type: Number },
  purchased_value_in_usd: { type: Number },
  date_n_time: { type: Date, required: true, default: Date.now },
})

companyHoldingSchema.index({ company_row_id: 1, purchased_value_in_usd: -1 })
companyHoldingSchema.index({ company_type: 1, company_row_id: 1 })
companyHoldingSchema.index({ company_row_id: 1, token_type: 1, purchased_value_in_usd: -1 })
companyHoldingSchema.index({ token_type: 1, company_row_id: 1, token_row_id: 1 })

companyHoldingSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_holdings')
  }
  next()
})

export const CompanyHoldingM = mongoose.model('cln_company_holdings', companyHoldingSchema, 'cln_company_holdings')
