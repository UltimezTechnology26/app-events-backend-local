// modules/professionals-faq/professionals-faq.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `ProfessionalsFaqM`'s schema now lives here, ported
// verbatim from the legacy `models/app/users/professionals_faqM.js`. The legacy file was reduced
// to a one-line passthrough so untouched legacy files that stay mounted (link_pages.js,
// setting.js, pro_batch.js, app_helper.js) keep resolving to the exact same compiled model object
// — same reverse-shim pattern already applied to every other colocated model in this migration
// (see professionals.models.ts's own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const professionalsFaqSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, index: true },
  faq_question: { type: String },
  faq_answer: { type: String },
})

professionalsFaqSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_faq_lists')
  }
  next()
})

export const ProfessionalsFaqM = mongoose.model('cln_professionals_faq_lists', professionalsFaqSchema, 'cln_professionals_faq_lists')
