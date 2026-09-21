// modules/company_watchlist/company_watchlist.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyWatchlistM`'s schema now lives here, ported
// verbatim from the legacy `models/app/watchlist/companyM.js` (every field including its own
// commented-out dead field, the index, the `pre('save')` auto-increment hook using the same
// `cln_company_watchlists` counter this module's own service already calls
// `getCollectionID('cln_company_watchlists')` for).
//
// `models/app/watchlist/companyM.js` was reduced to a one-line passthrough so any other call site
// keeps resolving to the exact same compiled model object - same reverse-shim pattern already
// applied to every professionals-* model (see professionals.models.ts's own doc comment for the
// general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const companyWatchlistSchema = new mongoose.Schema({
  _id: { type: Number },
  company_row_id: { type: Number, required: true, index: true },
  // index removed: subsumed by the compound {user_row_id:1, company_row_id:1} index below — every
  // query on this model filters by both fields together.
  user_row_id: { type: Number },
  // email_send_status: { type: Boolean },
  last_email_sent_on: { type: Date },
  date_n_time: { type: Date },
})

companyWatchlistSchema.index({ user_row_id: 1, company_row_id: 1 })

companyWatchlistSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_watchlists')
  }
  next()
})

export const CompanyWatchlistM = mongoose.model('cln_company_watchlists', companyWatchlistSchema, 'cln_company_watchlists')
