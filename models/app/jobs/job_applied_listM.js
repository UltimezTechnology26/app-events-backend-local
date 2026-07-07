const mongoose = require('mongoose');
const { getCollectionID } = require('../../../utils/helpers/database_helper');

const saveSchema = mongoose.Schema({
    _id: { type: Number },
    company_row_id: { type: Number, required: true, ref: "cln_company_lists" },
    user_row_id: { type: Number, required: true, ref: "cln_professionals" },
    linkedIn: { type: String },
    job_id: { type: Number, required: true, ref: "cln_jobs" },
    salary_expectations: { type: Number, min: 0, required: true },
    highest_education: { type: Number, required: true, ref: "cln_job_education_types" },
    key_skills: { type: [Number], required: true, ref: "cln_job_skills" },
    credentials: { type: [String] },
    resume: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected", "scheduled"], default: "pending" },
    rejected_reason: { type: String, default: null }
}, { versionKey: false, timestamps: true });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_job_applied_lists');
        this._id = value;
    }
    next();
});

saveSchema.index({ user_row_id: 1, job_id: 1, status: 1 });
saveSchema.index({ key_skills: 1 });
saveSchema.index({ salary_expectations: 1 });
saveSchema.index({ highest_education: 1 });


module.exports = mongoose.model('cln_job_applied_lists', saveSchema);
