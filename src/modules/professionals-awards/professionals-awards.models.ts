// modules/professionals-awards/professionals-awards.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `ProfessionalsAwardsM`'s schema now lives here, ported
// verbatim from the legacy `models/app/users/professionals_awardsM.js`. The legacy file was
// reduced to a one-line passthrough so untouched legacy files that stay mounted
// (controllers/app/link_pages.js, utils/helpers/app_helper.js's deleteUserAward) keep resolving to
// the exact same compiled model object — same reverse-shim pattern already applied to every other
// colocated model in this migration (see professionals.models.ts's own doc comment for the
// general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const professionalsAwardsSchema = new mongoose.Schema({
  _id: { type: Number },
  user_row_id: { type: Number, index: true },
  award_title: { type: String },
  award_description: { type: String },
  award_image: { type: String },
})

professionalsAwardsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_awards')
  }
  next()
})

export const ProfessionalsAwardsM = mongoose.model('cln_professionals_awards', professionalsAwardsSchema, 'cln_professionals_awards')
