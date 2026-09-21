// modules/professionals-profile-images/professionals-profile-images.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `ProfessionalProfileImagesM`'s schema now lives here,
// ported verbatim from the legacy `models/app/professionals_profile_imagesM.js` (every field, all
// 7 `.index()` calls, the `pre('save')` auto-increment hook). This is this model's designated
// owner per the plan's model-to-module mapping.
//
// `models/app/professionals_profile_imagesM.js` was reduced to a one-line passthrough so every
// legacy call site (`setting.js`, `admin_panel/app/user.js`, and the core `professionals` module's
// own re-export of this same model) keeps resolving to the exact same compiled model object — see
// `professionals.models.ts`'s own doc comment for the general pattern.
//
// `DefaultProfileImgM` stays a plain re-export, NOT colocated here: it's generic, cross-cutting
// static reference data (confirmed used by events/static/followers/link_pages/professionals - not
// owned by this domain specifically), matching this migration's own established exception for
// shared reference models.
import mongoose from 'mongoose'
import DefaultProfileImgM from '../../../models/app/static/default_profile_imgM'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const professionalProfileImagesSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, unique: true, required: true, index: true },
  // 0: uploaded image, >0: default images
  profile_image_type: { type: Number },
  profile_image: { type: String },
})

professionalProfileImagesSchema.index({ user_row_id: 1 })
professionalProfileImagesSchema.index({ user_row_id: 1, _id: 1 })
professionalProfileImagesSchema.index({ user_row_id: 1, profile_image_type: 1 })
professionalProfileImagesSchema.index({ user_row_id: 1, profile_image_type: 1, _id: 1 })
professionalProfileImagesSchema.index({ user_row_id: 1, profile_image: 1 })
professionalProfileImagesSchema.index({ user_row_id: 1, profile_image_type: 1, profile_image: 1 })
professionalProfileImagesSchema.index({ user_row_id: 1, profile_image: 1, _id: 1 })

professionalProfileImagesSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_profile_images')
  }
  next()
})

export const ProfessionalProfileImagesM = mongoose.model('cln_professionals_profile_images', professionalProfileImagesSchema, 'cln_professionals_profile_images')

export { DefaultProfileImgM }
