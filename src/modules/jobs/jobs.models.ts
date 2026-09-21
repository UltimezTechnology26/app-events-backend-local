// modules/jobs/jobs.models.ts
//
// REAL SCHEMA COLOCATION (2026-09-17): `JobsM`'s schema now lives here, ported verbatim from the
// legacy `models/app/jobs/jobsM.js` (every field, every `.index()` call, the `pre('save')`
// auto-increment hook, `timestamps: true`). `jobsM` is genuinely owned by this module - confirmed
// via a repo-wide grep that every other consumer (company, company_admin, company_overview,
// partners) only ever reads job postings, never owns the schema.
//
// `models/app/jobs/jobsM.js` was reduced to a one-line passthrough so every legacy/other-module
// call site keeps resolving to the exact same compiled model object - same reverse-shim pattern
// already applied to every professionals-* model (see professionals.models.ts's own doc comment
// for the general reasoning).
import mongoose from 'mongoose'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const jobsSchema = new mongoose.Schema(
  {
    _id: { type: Number },
    company_row_id: { type: Number, required: true, ref: 'cln_company_lists' },
    job_title: { type: String, required: true },
    country_id: { type: Number, required: true },
    experience_level: { type: String, required: true },
    job_type: { type: String },
    work_location_type: { type: String },
    location: { type: String },
    salary_from: { type: Number, min: 0 },
    salary_to: { type: Number, min: 0 },
    no_of_openings: { type: Number, min: 1 },
    application_deadline: { type: Date },
    highest_education: { type: Number, required: true, ref: 'cln_job_education_types' },
    key_skills: { type: [Number], required: true, ref: 'cln_job_skills' },
    job_description: { type: String, required: true },
    active_status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_deleted: { type: Boolean, default: false },
  },
  { versionKey: false, timestamps: true },
)

jobsSchema.pre('save', async function (next) {
  if (!this._id) {
    this._id = await getCollectionID('cln_jobs')
  }
  next()
})

jobsSchema.index({ company_row_id: 1, active_status: 1, is_deleted: 1 })
jobsSchema.index({ application_deadline: 1 })
jobsSchema.index({ key_skills: 1 })
jobsSchema.index({ createdAt: -1, active_status: 1, is_deleted: 1 })
// FLAGGED, NOT FIXED (pre-existing bug in the legacy schema, confirmed by real typing - not
// introduced by this colocation): these two index specs use literal filter-like values
// ('active'/false) instead of a sort direction (1/-1/'text') - almost certainly meant to be a
// partial index (`partialFilterExpression`) that was never actually wired up. Cast preserves the
// exact same (buggy) `.index()` call Mongoose has always received; correcting it would be a real
// index-definition change needing sign-off, not a type-only fix.
jobsSchema.index({ company_row_id: 1, active_status: 'active', is_deleted: false } as unknown as Record<string, mongoose.IndexDirection>)
jobsSchema.index({ active_status: 'active', is_deleted: false, createdAt: -1 } as unknown as Record<string, mongoose.IndexDirection>)

export const JobsM = mongoose.model('cln_jobs', jobsSchema, 'cln_jobs')
