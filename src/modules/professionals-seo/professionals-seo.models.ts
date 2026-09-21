// modules/professionals-seo/professionals-seo.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `ProfessionalSeoDetailsM`'s schema now lives here, ported
// verbatim from the legacy `models/app/professionals_seo_detailsM.js` (every field, both
// `.index()` calls, the `pre('save')` auto-increment hook). This is this model's designated owner
// per the plan's model-to-module mapping.
//
// `models/app/professionals_seo_detailsM.js` was reduced to a one-line passthrough so every legacy
// call site (`setting.js`, and the core `professionals` module's own re-export of this same model)
// keeps resolving to the exact same compiled model object — see `professionals.models.ts`'s own
// doc comment for the general pattern.
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const professionalSeoDetailsSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, unique: true, required: true, index: true },
  meta_title: { type: String },
  meta_keywords: { type: String },
  meta_description: { type: String },
  robots_index: { type: String, enum: ['index', 'noindex'], default: 'index' },
  robots_follow: { type: String, enum: ['follow', 'nofollow'], default: 'follow' },
  og_title: { type: String, default: '' },
  og_description: { type: String, default: '' },
  twitter_title: { type: String, default: '' },
  twitter_description: { type: String, default: '' },
  // Example: @username
  twitter_creator: { type: String, default: '' },
  header_structure: {
    type: [
      {
        tag: String,
        text: String,
      },
    ],
    default: [],
  },
})

professionalSeoDetailsSchema.index({ user_row_id: 1 })
professionalSeoDetailsSchema.index({ user_row_id: 1, _id: 1 })

professionalSeoDetailsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_seo_details')
  }
  next()
})

export const ProfessionalSeoDetailsM = mongoose.model('cln_professionals_seo_details', professionalSeoDetailsSchema, 'cln_professionals_seo_details')
