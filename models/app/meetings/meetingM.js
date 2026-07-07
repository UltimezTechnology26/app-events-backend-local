const mongoose = require("mongoose");
const { getCollectionID } = require("../../../utils/helpers/database_helper");

const meetingSchema = mongoose.Schema(
    {
        _id: { type: Number },

        meeting_type: {
            type: String,
            enum: ["1on1", "journalist_interview", "business_meeting", "job_interview"],
            required: true,
        },
        user_row_id: {
            type: Number,
        },
        requested_user_row_id: [{
            type: Number, ref: "cln_professionals"
        }],
        requested_company_row_id: [{
            type: Number, ref: "cln_company_lists"
        }],
        company_row_id: {
            type: Number,
        },
        rescheduled_by: {
            type: Number,
        },

        // Common fields
        meeting_title: { type: String, required: true },
        meeting_link: { type: String },
        meeting_datetime: { type: Date, required: true },
        meeting_timezone: { type: String, required: true },

        // For journalist interview
        upload_document: { type: String },

        // For job interview
        job_role: { type: String },

        // General optional
        status: {
            type: String,
            enum: ["scheduled", "rescheduled", "completed", "rejected", "pending"],
            default: "scheduled",
        },
        rejected_comment: { type: String },
        rescheduled_count: { type: String },
        status_update_by: { type: Number },
        status_update_date: { type: String },
        status_update_admin_user_type: { type: Number, default: 0 },
    },
    { versionKey: false, timestamps: true }
);

// Auto increment ID
meetingSchema.pre("save", async function (next) {
    if (!this._id) {
        const value = await getCollectionID("cln_meetings");
        this._id = value;
    }
    next();
});

// Indexes
meetingSchema.index({ meeting_datetime: 1 });
meetingSchema.index({ meeting_type: 1, status: 1 });

meetingSchema.index({ user_row_id: 1, status: 1, meeting_type: 1 });
meetingSchema.index({ company_row_id: 1, status: 1, meeting_type: 1 });
meetingSchema.index({ requested_user_row_id: 1, status: 1, meeting_type: 1 });
meetingSchema.index({ requested_company_row_id: 1, status: 1, meeting_type: 1 });
meetingSchema.index({ status: 1, meeting_datetime: 1 });
meetingSchema.index({ meeting_type: 1, status: 1, meeting_datetime: 1 });

meetingSchema.index({
    user_row_id: 1,
    company_row_id: 1,
    status: 1,
    meeting_type: 1,
    meeting_datetime: 1
});

module.exports = mongoose.model("cln_meetings", meetingSchema);
