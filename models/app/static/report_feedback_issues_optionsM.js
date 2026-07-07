const mongoose = require("mongoose")
const { getCollectionID } = require("../../../utils/helpers/database_helper")

/* ---------------- SUB SCHEMA ---------------- */
const reportIssueSchema = new mongoose.Schema(
    {
        _id: {
            type: Number,
            required: true
        },
        option: {
            type: String,
            required: true,
            trim: true
        }
    },
    { _id: false }
)

/* ---------------- MAIN SCHEMA ---------------- */
const saveSchema = new mongoose.Schema(
    {
        _id: {
            type: Number
        },

        module_type: {
            type: Number,
            required: true,
            index: true
            // 1=company, 2=professional, 3=markets, 4=blockchain, 5=exchanges
        },

        tab_key: {
            type: String,
            required: true,
            trim: true,
            index: true
        },

        tab_name: {
            type: String,
            required: true,
            trim: true
        },

        sub_tab_key: {
            type: String,
            default: null,
            index: true
        },

        report_issues: {
            type: [reportIssueSchema],
            required: true
        },

        active_status: {
            type: Boolean,
            default: true,
            index: true
        },

        date_n_time: {
            type: Date,
            default: Date.now
        }
    },
    {
        collection: "cln_static_report_issue",
        versionKey: false
    }
)

saveSchema.index({ module_type: 1, tab_key: 1 })
saveSchema.index({ module_type: 1, tab_key: 1, sub_tab_key: 1 })

saveSchema.pre("save", async function (next) {
    if (!this._id) {
        this._id = await getCollectionID("cln_static_report_issue")
    }
    next()
})

module.exports = mongoose.model(
    "cln_static_report_issue",
    saveSchema
)
