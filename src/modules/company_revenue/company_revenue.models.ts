// modules/company_revenue/company_revenue.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyRevenueGrowthM`'s schema now lives here, ported
// verbatim from the legacy `models/app/company/company_revenue_growthM.js` (every field, every
// `.index()` call, the `pre('save')` auto-increment hook). This model is genuinely owned by this
// module - `company`/`company_overview`'s own reads of it are plain lookups, not ownership,
// confirmed via a repo-wide grep.
//
// `models/app/company/company_revenue_growthM.js` was reduced to a one-line passthrough so any
// other call site keeps resolving to the exact same compiled model object - same reverse-shim
// pattern already applied to every professionals-* model (see professionals.models.ts's own doc
// comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const companyRevenueGrowthSchema = new mongoose.Schema({
  _id: { type: Number },
  company_row_id: { type: Number },
  year: { type: Number },
  // 1. Q1, 2. Q2, 3. Q3, 4. Q4, 5. Yearly
  quarter: { type: Number },
  revenue: { type: Number },
  revenue_streams: [
    {
      category_row_id: { type: Number },
      stream_amount: { type: Number },
    },
  ],
  updated_date_n_time: { type: Date },
})

// Additional indexes for companyList function optimization
companyRevenueGrowthSchema.index({ company_row_id: 1, year: -1, quarter: -1 })
companyRevenueGrowthSchema.index({ company_row_id: 1 })
companyRevenueGrowthSchema.index({ company_row_id: 1, year: 1 })

companyRevenueGrowthSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_revenue_details')
  }
  next()
})

export const CompanyRevenueGrowthM = mongoose.model('cln_company_revenue_details', companyRevenueGrowthSchema, 'cln_company_revenue_details')
