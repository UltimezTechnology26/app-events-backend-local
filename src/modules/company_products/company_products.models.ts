// modules/company_products/company_products.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyProductsM`'s schema now lives here, ported verbatim
// from the legacy `models/markets/products_n_holding/company_productsM.js` (every field, every
// `.index()` call plus its own doc comment about a removed stale index, the `pre('save')`
// auto-increment hook). This model is genuinely owned by this module - `company`/`company_admin`'s
// own reads of it are plain lookups, not ownership, confirmed via a repo-wide grep.
//
// `models/markets/products_n_holding/company_productsM.js` was reduced to a one-line passthrough
// so any other call site keeps resolving to the exact same compiled model object - same
// reverse-shim pattern already applied to every professionals-* model (see
// professionals.models.ts's own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const companyProductsSchema = new mongoose.Schema({
  _id: { type: Number },
  company_type: { type: Number, required: true },
  company_row_id: { type: Number, required: true, index: true },
  register_type: { type: Number, required: true, index: true },
  product_type: { type: Number, required: true, index: true },
  // 1: Crypto token, 2: Blockchain, 3: Exchange
  product_row_id: { type: Number, required: true, index: true },
  date_n_time: { type: Date, required: true, default: Date.now },
})

// Removed: saveSchema.index({ company_row_id: 1, token_type: 1, token_row_id: 1 }) referenced
// `token_type`/`token_row_id`, fields that don't exist anywhere in this schema (only
// `product_type`/`product_row_id` do) — a stale index left over from a schema rename, confirmed
// dead via live index-usage monitoring.
companyProductsSchema.index({ company_type: 1, company_row_id: 1 })
companyProductsSchema.index({ company_row_id: 1, register_type: 1, product_type: 1 })
companyProductsSchema.index({ company_row_id: 1, product_type: 1 })

companyProductsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_products')
  }
  next()
})

export const CompanyProductsM = mongoose.model('cln_company_products', companyProductsSchema, 'cln_company_products')
