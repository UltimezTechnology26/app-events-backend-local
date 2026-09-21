// modules/funding/funding.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `FundingInvestmentM`'s schema now lives here, ported
// verbatim from the legacy `models/app/funding/fundingInvestmentM.js` (every field, every
// `.index()` call, the `pre('save')` auto-increment hook). `fundingInvestmentM` is genuinely owned
// by this module - confirmed via a repo-wide grep that every other consumer (company,
// company_manual, company_overview) only ever reads/aggregates investment records, never owns the
// schema.
//
// `models/app/funding/fundingInvestmentM.js` was reduced to a one-line passthrough so every other
// call site keeps resolving to the exact same compiled model object - same reverse-shim pattern
// already applied to every professionals-* model (see professionals.models.ts's own doc comment
// for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const fundingInvestmentSchema = new mongoose.Schema({
  _id: { type: Number },
  // 1: user, 2: company
  investor_type: { type: Number, index: true },
  // 1: registered, 2: manual
  investor_registered_type: { type: Number, index: true },
  // _id of users or companies
  investor_row_id: { type: Number, index: true },
  // 1: registered, 2: manual
  funds_raised_registered_type: { type: Number, index: true },
  funds_raised_company_row_id: { type: Number, index: true },
  // funding rounds — index defined once below via schema.index(), not here too
  category_row_id: { type: Number },
  // 1: user, 2: company
  investor_category_row_id: { type: Number, index: true },
  announcement_date: { type: Date },
  amount: { type: Number },
  // funding round id which stores multiple investments
  round_id: { type: Number, index: true },
  // 0: Pending, 1: Approved
  verified_status: { type: Number, default: 0 },
  verified_on: { type: Date },
  reject_type: { type: Number },
  reject_reason: { type: String },
  date_n_time: { type: Date },
})

fundingInvestmentSchema.index({ verified_status: 1, investor_type: 1, investor_registered_type: 1, investor_row_id: 1 })
fundingInvestmentSchema.index({ announcement_date: 1 })
fundingInvestmentSchema.index({ amount: 1 })

// Critical indexes for getUserListDetails performance
fundingInvestmentSchema.index({ investor_type: 1, investor_registered_type: 1, investor_row_id: 1 })
fundingInvestmentSchema.index({ investor_type: 1, investor_registered_type: 1, investor_row_id: 1, verified_status: 1 })

// Additional indexes for companyList function optimization
fundingInvestmentSchema.index({ investor_type: 1, investor_registered_type: 1, verified_status: 1 })
fundingInvestmentSchema.index({ funds_raised_company_row_id: 1, funds_raised_registered_type: 1, verified_status: 1 })
fundingInvestmentSchema.index({ investor_row_id: 1, investor_type: 1, investor_registered_type: 1, verified_status: 1 })
fundingInvestmentSchema.index({ category_row_id: 1 })

fundingInvestmentSchema.index({ funds_raised_company_row_id: 1, verified_status: 1 })
fundingInvestmentSchema.index({ investor_type: 1, investor_registered_type: 1, funds_raised_company_row_id: 1, verified_status: 1 })

// funds_raised_list / company_funding_details date sort within a company
fundingInvestmentSchema.index({ funds_raised_company_row_id: 1, announcement_date: -1 })
// investment_graph / investor overview date sort within an investor
fundingInvestmentSchema.index({ investor_row_id: 1, announcement_date: -1 })
// verifyRound / rejectRound / createOrUpdateRound pending-round lookups
fundingInvestmentSchema.index({ round_id: 1, verified_status: 1 })

fundingInvestmentSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_funding_investment_lists')
  }
  next()
})

export const FundingInvestmentM = mongoose.model('cln_funding_investment_lists', fundingInvestmentSchema, 'cln_funding_investment_lists')
