// modules/team-members/team-members.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `EmployeesRequestsM`'s schema now lives here, ported
// verbatim from the legacy `models/app/company/employees_requestsM.js` (every field, the index,
// the `pre('save')` auto-increment hook). This model is genuinely owned by this module -
// `company`'s own read of it is a plain lookup, not ownership, confirmed via a repo-wide grep.
//
// `models/app/company/employees_requestsM.js` was reduced to a one-line passthrough so any other
// call site keeps resolving to the exact same compiled model object - same reverse-shim pattern
// already applied to every professionals-* model (see professionals.models.ts's own doc comment
// for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const employeesRequestsSchema = new mongoose.Schema({
  _id: { type: Number },
  company_row_id: { type: Number, required: true },
  user_row_id: { type: Number, required: true },
  // 0: not employee, 1: pending, 2: approved, 3: rejected
  approval_status: { type: Number, required: true },
  date_n_time: { type: Date, required: true },
})

employeesRequestsSchema.index({ company_row_id: 1, user_row_id: 1 })

employeesRequestsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_employees_requests')
  }
  next()
})

export const EmployeesRequestsM = mongoose.model('cln_company_employees_requests', employeesRequestsSchema, 'cln_company_employees_requests')
