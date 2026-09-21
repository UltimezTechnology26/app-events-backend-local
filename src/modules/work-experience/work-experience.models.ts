// modules/work-experience/work-experience.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `ProfessionalsWorkExperienceM`'s schema now lives here,
// ported verbatim from the legacy `models/app/professionals_work_experienceM.js` (every field
// including its own commented-out dead fields, every `.index()` call, the `pre('save')`
// auto-increment hook). This model is genuinely owned by this module per the Professionals plan's
// model-to-module mapping.
//
// `models/app/professionals_work_experienceM.js` was reduced to a one-line passthrough so every
// other call site (company, company_manual, team-members, and every professionals-* module) keeps
// resolving to the exact same compiled model object - same reverse-shim pattern already applied to
// every professionals-* model (see professionals.models.ts's own doc comment for the general
// reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const professionalsWorkExperienceSchema = new mongoose.Schema({
  _id: { type: Number },
  // 1: registered user, 2: manual user
  user_account_type: { type: Number, required: true, index: true },
  user_row_id: { type: Number, required: true, index: true },
  // 1: registered, 2: manual
  company_type: { type: Number, index: true },
  company_row_id: { type: Number, index: true },
  // 1. Full time 2. Part time 3. Internship 4. Freelancer 5. Trainee
  employment_type: { type: Number, index: true },
  // 1. Admin added 2. Manually added
  position_type: { type: Number, default: 1, index: true },
  position_row_id: { type: Number, index: true },
  sub_position_row_id: { type: Number, index: true },
  responsibilities: { type: String },
  // 1. Onsite 2. Hybrid 3. Remote
  location_type: { type: Number },
  // 1. employee 2. board member 3. advisor
  designation_type: { type: Number, default: 1 },
  location: { type: String },
  start_date: { type: Date },
  // 1: not present, 2: present
  till_date_status: { type: Number },
  end_date: { type: Date },
  // false: not verified, true: verified
  verified_status: { type: Boolean, default: false },
  verified_on: { type: Date },
  // link page display status & only for currently working
  public_view: { type: Boolean, default: false },
  positions: [
    {
      _id: false,
      // 1: static, 2: manual
      position_type: { type: Number, required: true },
      // used when position_type === 1
      position_row_id: { type: Number },
      // used when position_type === 2
      sub_position_row_id: { type: Number },
    },
  ],
})

professionalsWorkExperienceSchema.index({ user_row_id: 1, public_view: 1, till_date_status: 1 })
professionalsWorkExperienceSchema.index({ position_type: 1, sub_position_row_id: 1 })
professionalsWorkExperienceSchema.index({ company_type: 1, company_row_id: 1 })
professionalsWorkExperienceSchema.index({ user_row_id: 1, start_date: -1 })
professionalsWorkExperienceSchema.index({ user_account_type: 1, user_row_id: 1 })
professionalsWorkExperienceSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1 })
professionalsWorkExperienceSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, start_date: -1 })
professionalsWorkExperienceSchema.index({ verified_status: 1, company_type: 1, company_row_id: 1, till_date_status: 1 })
professionalsWorkExperienceSchema.index({ position_row_id: 1 })
professionalsWorkExperienceSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, position_row_id: 1 })
professionalsWorkExperienceSchema.index({ company_type: 1, company_row_id: 1, user_row_id: 1 })
professionalsWorkExperienceSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, position_type: 1 })
professionalsWorkExperienceSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, start_date: -1, position_row_id: 1 })
professionalsWorkExperienceSchema.index({ company_type: 1, company_row_id: 1, position_row_id: 1 })
professionalsWorkExperienceSchema.index({ user_row_id: 1, public_view: 1, user_account_type: 1, company_type: 1, company_row_id: 1 })

professionalsWorkExperienceSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_professionals_work_experiences')
  }
  next()
})

export const ProfessionalsWorkExperienceM = mongoose.model('cln_professionals_work_experiences', professionalsWorkExperienceSchema, 'cln_professionals_work_experiences')
