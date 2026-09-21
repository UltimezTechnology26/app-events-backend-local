// modules/company/faq/company.faq.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `CompanyFaqM`'s schema now lives here, ported verbatim from
// the legacy `models/app/company/company_faqM.js` (every field, the `pre('save')` auto-increment
// hook). This model is genuinely owned by this submodule - mirrors the same split already done
// for Professionals (`professionals-faq`).
//
// `models/app/company/company_faqM.js` was reduced to a one-line passthrough so every other call
// site (`company`'s own list/queries reads, the change-request module's generic apply-writers
// layer) keeps resolving to the exact same compiled model object - same reverse-shim pattern
// already applied to every other colocated model in this migration (see professionals.models.ts's
// own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../../utils/helpers/database_helper')

const companyFaqSchema = new mongoose.Schema({
  _id: { type: Number },
  company_row_id: { type: Number, index: true },
  faq_question: { type: String },
  faq_answer: { type: String },
})

companyFaqSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_company_faq_lists')
  }
  next()
})

export const CompanyFaqM = mongoose.model('cln_company_faq_lists', companyFaqSchema, 'cln_company_faq_lists')
