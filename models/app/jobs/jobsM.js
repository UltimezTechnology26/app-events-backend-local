const mongoose = require('mongoose');
const { getCollectionID } = require('../../../utils/helpers/database_helper');

const saveSchema = mongoose.Schema({
    _id: { type: Number },
    company_row_id: { type: Number, required: true, ref: "cln_company_lists" },
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
    highest_education: { type: Number, required: true, ref: "cln_job_education_types" },
    key_skills: { type: [Number], required: true, ref: "cln_job_skills" },
    job_description: { type: String, required: true },
    active_status: { type: String, enum: ["active", "inactive"], default: "active" },
    is_deleted: { type: Boolean, default: false },
}, { versionKey: false, timestamps: true });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_jobs');
        this._id = value;
    }
    next();
});

saveSchema.index({ company_row_id: 1, active_status: 1, is_deleted: 1 });
saveSchema.index({ application_deadline: 1 });
saveSchema.index({ key_skills: 1 });

saveSchema.index({ createdAt: -1, active_status: 1, is_deleted: 1 });

saveSchema.index({ company_row_id: 1, active_status: "active", is_deleted: false });
saveSchema.index({ active_status: "active", is_deleted: false, createdAt: -1 });

module.exports = mongoose.model('cln_jobs', saveSchema);
