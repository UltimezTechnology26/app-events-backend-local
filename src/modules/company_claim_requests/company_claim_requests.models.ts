// modules/company_claim_requests/company_claim_requests.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyClaimRequestsM`'s schema now lives here, ported
// verbatim from the legacy `models/app/company/company_claim_requestsM.js` (the field set, the
// duplicate-check compound index and its own doc comment, the `pre('save')` auto-increment hook).
// This model is genuinely owned by this module - `company_admin` only ever reads it for the admin
// review queue, confirmed via a repo-wide grep.
//
// `models/app/company/company_claim_requestsM.js` was reduced to a one-line passthrough so
// `company_admin` and any other call site keep resolving to the exact same compiled model object -
// same reverse-shim pattern already applied to every professionals-* model (see
// professionals.models.ts's own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const companyClaimRequestsSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number },
  company_row_id: { type: Number },
  // 1: Same Email ID, 2: Different Email ID but same Domain, 3: Same domain - If email id not there
  claim_type: { type: Number },
  // 0: Not Requested, 1: Pending, 2: Accepted, 3: Rejected
  claim_status: { type: Number, default: 0 },
  claim_action_date_n_time: { type: Date },
  claim_rejected_reason: { type: String },
  date_n_time: { type: Date },
})

// Confirmed via evidence: add_new_claim_request's duplicate-check ({user_row_id, company_row_id,
// claim_status:1}) runs on every claim submission (a hot, race-prone path — same class as the
// watchlist duplicate-check fixed earlier this engagement). Replaces the two standalone
// single-field indexes above, which covered no query shape actually run against this collection.
companyClaimRequestsSchema.index({ user_row_id: 1, company_row_id: 1, claim_status: 1 })

companyClaimRequestsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_claim_requests')
  }
  next()
})

export const CompanyClaimRequestsM = mongoose.model('cln_company_claim_requests', companyClaimRequestsSchema, 'cln_company_claim_requests')
