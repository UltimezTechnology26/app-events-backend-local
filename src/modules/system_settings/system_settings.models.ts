// modules/system_settings/system_settings.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): all 5 reference-table schemas this module manages as its
// own CRUD domain now live here, ported verbatim from their legacy files (every field, every
// `.index()` call, every `pre('save')` auto-increment hook). Unlike a model another module merely
// reads for a lookup, these ARE this module's core domain - `system_settings.event_tags.*`,
// `.experience_level.*`, `.report_issues_options.*`, `.user_expertise.*` (= user designations),
// and `.area_of_interests.*` (= "looking for") are the CRUD features built directly on top of
// each one.
//
// Each legacy file (`models/app/static/event_tagsM.js`, `experience_levelsM.js`,
// `report_feedback_issues_optionsM.js`, `user_designationsM.js`, `user_looking_forM.js`) was
// reduced to a one-line passthrough so any other call site (e.g. `professionals`,
// `professionals-approvals` reading designation/looking-for names) keeps resolving to the exact
// same compiled model object - same reverse-shim pattern already applied to every professionals-*
// model (see professionals.models.ts's own doc comment for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const eventTagsSchema = new mongoose.Schema({
  _id: { type: Number },
  event_tag: { type: String, required: true },
  keywords: { type: String },
  active_status: { type: Boolean, default: true },
  date_n_time: { type: Date },
})

eventTagsSchema.index({ _id: 1, active_status: 1 })
eventTagsSchema.index({ _id: 1, active_status: 1, event_tag: 1 })
eventTagsSchema.index({ active_status: 1, event_tag: 1 })
eventTagsSchema.index({ active_status: 1, _id: 1 })

eventTagsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_events_tags')
  }
  next()
})

export const EventTagsM = mongoose.model('cln_events_tags', eventTagsSchema, 'cln_events_tags')

const experienceLevelsSchema = new mongoose.Schema({
  _id: { type: Number },
  experience: { type: String },
  active_status: { type: Boolean, default: true },
  date_n_time: { type: Date },
})

experienceLevelsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_static_experiences')
  }
  next()
})

export const ExperienceLevelsM = mongoose.model('cln_static_experiences', experienceLevelsSchema, 'cln_static_experiences')

const reportIssueSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true },
    option: { type: String, required: true, trim: true },
  },
  { _id: false },
)

const reportFeedbackIssuesOptionsSchema = new mongoose.Schema(
  {
    _id: { type: Number },
    // 1=company, 2=professional, 3=markets, 4=blockchain, 5=exchanges
    module_type: { type: Number, required: true, index: true },
    tab_key: { type: String, required: true, trim: true, index: true },
    tab_name: { type: String, required: true, trim: true },
    sub_tab_key: { type: String, default: null, index: true },
    report_issues: { type: [reportIssueSchema], required: true },
    active_status: { type: Boolean, default: true, index: true },
    date_n_time: { type: Date, default: Date.now },
  },
  { collection: 'cln_static_report_issue', versionKey: false },
)

reportFeedbackIssuesOptionsSchema.index({ module_type: 1, tab_key: 1 })
reportFeedbackIssuesOptionsSchema.index({ module_type: 1, tab_key: 1, sub_tab_key: 1 })

reportFeedbackIssuesOptionsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_static_report_issue')
  }
  next()
})

export const ReportFeedbackIssuesOptionsM = mongoose.model('cln_static_report_issue', reportFeedbackIssuesOptionsSchema, 'cln_static_report_issue')

const userDesignationsSchema = new mongoose.Schema({
  _id: { type: Number },
  designation_name: { type: String, required: true },
  // show in job: 1, don't show in job: 2
  show_in_job_status: { type: Number, default: 1 },
  active_status: { type: Boolean, default: true },
  date_n_time: { type: Date },
})

userDesignationsSchema.index({ _id: 1, active_status: 1 })
userDesignationsSchema.index({ active_status: 1, designation_name: 1 })
userDesignationsSchema.index({ designation_name: 1 })
userDesignationsSchema.index({ _id: 1, active_status: 1, designation_name: 1 })

userDesignationsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_static_user_designations')
  }
  next()
})

export const UserDesignationsM = mongoose.model('cln_static_user_designations', userDesignationsSchema, 'cln_static_user_designations')

const userLookingForSchema = new mongoose.Schema({
  _id: { type: Number },
  name: { type: String, required: true },
  active_status: { type: Boolean, default: true },
  date_n_time: { type: Date },
})

userLookingForSchema.index({ _id: 1, active_status: 1 })
userLookingForSchema.index({ active_status: 1, name: 1 })

userLookingForSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_static_user_looking_for_lists')
  }
  next()
})

export const UserLookingForM = mongoose.model('cln_static_user_looking_for_lists', userLookingForSchema, 'cln_static_user_looking_for_lists')
