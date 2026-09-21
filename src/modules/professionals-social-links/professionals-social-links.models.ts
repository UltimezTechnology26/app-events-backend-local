// modules/professionals-social-links/professionals-social-links.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `ProfessionalSocialLinksM`'s schema now lives here,
// ported verbatim from the legacy `models/app/professionals_social_linksM.js` (every field, both
// `.index()` calls, the `pre('save')` auto-increment hook). This is this model's designated owner
// per the plan's model-to-module mapping.
//
// `models/app/professionals_social_linksM.js` was reduced to a one-line passthrough
// (`module.exports = require('../../src/modules/professionals-social-links/
// professionals-social-links.models').ProfessionalSocialLinksM`) so every legacy call site
// (`setting.js`, and the core `professionals` module's own re-export of this same model) keeps
// resolving to the exact same compiled model object — see `professionals.models.ts`'s own doc
// comment for the general pattern (first applied there, same reasoning here).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires -- matches this repo's existing
// TS-module convention for this helper (see funding.service.ts, professionals.models.ts)
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const professionalSocialLinksSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, unique: true, required: true, index: true },
  website: { type: String },
  facebook: { type: String },
  twitter: { type: String },
  linkedin: { type: String },
  instagram: { type: String },
  video_link: { type: String },
  telegram: { type: String },
  medium: { type: String },
  reddit: { type: String },
  feed_url: { type: String },
  other_social_links: { type: Object },
  youtube_channel: { type: String },
})

professionalSocialLinksSchema.index({ user_row_id: 1 })
professionalSocialLinksSchema.index({ user_row_id: 1, _id: 1 })

professionalSocialLinksSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_social_links')
  }
  next()
})

export const ProfessionalSocialLinksM = mongoose.model('cln_professionals_social_links', professionalSocialLinksSchema, 'cln_professionals_social_links')
