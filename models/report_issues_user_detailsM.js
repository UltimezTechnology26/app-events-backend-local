const mongoose = require("mongoose")
const { getCollectionID } = require("../utils/helpers/database_helper")

/* ---------------- MAIN SCHEMA ---------------- */
const saveSchema = new mongoose.Schema({

    _id: {
        type: Number
    },

    /* ---------- MODULE INFO ---------- */
    module_type: {
        type: Number,
        required: true,
        index: true
        // 1=company, 2=professional, 3=markets, 4=blockchain, 5=exchanges
    },

    module_row_id: {
        type: Number,
        required: true,
        index: true
        // company_row_id / professional_row_id / token_row_id / etc
    },

    tab_key: {
        type: String,
        required: true,
        index: true
    },

    tab_name: {
        type: String,
        required: true
    },

    sub_tab_key: {
        type: String,
        default: null
        // finance -> funding / investment / revenue etc
    },

    /* ---------- ISSUE OPTION ---------- */
    option_id: {
        type: Number,
        required: true
        // refers to report_issues._id (master options table)
    },

    option_text: {
        type: String,
        default: null
        // snapshot of option text at submit time
    },

    description: {
        type: String,
        default: null
    },

    /* ---------- USER INFO ---------- */
    user_row_id: {
        type: Number,
        default: 0,
        index: true
    },

    /* ---------- WORKFLOW ---------- */
    requested_on: {
        type: Date,
        required: true,
        index: true
    },

    approved_status: {
        type: Number,
        default: 0,
        index: true
        // 0=pending, 1=verified, 2=rejected, 3=resolved
    },

    approved_by: {
        type: Number,
        default: null
        // 1=admin, 2=sub_admin
    },

    approved_row_id: {
        type: Number,
        default: null
    },
    issue_rejected_reason: {
        type: String,
        // default: ''
    },
    approved_date_n_time: {
        type: Date,
        default: null
    }

})

/* ---------- AUTO INCREMENT ID ---------- */
saveSchema.pre("save", async function (next) {
    if (!this._id) {
        const value = await getCollectionID("cln_report_issues_user_details")
        this._id = value
    }
    next()
})

/* ---------- INDEXES (IMPORTANT) ---------- */
saveSchema.index({ module_type: 1, tab_key: 1 })
saveSchema.index({ module_row_id: 1 })
saveSchema.index({ approved_status: 1 })

module.exports = mongoose.model("cln_report_issues_user_details", saveSchema)
