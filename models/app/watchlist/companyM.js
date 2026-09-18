const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number,
        required: true,
        index: true
    },
    user_row_id: {
        type: Number
        // index removed: subsumed by the compound {user_row_id:1, company_row_id:1} index
        // below (Part 2 §2.7) — every query on this model filters by both fields together.
    },
    // email_send_status: {
    //     type: Boolean,
    //     // default: false
    // },
    last_email_sent_on: { type: Date },

    date_n_time: {
        type: Date
    }
})

// company_row_id already has field-level `index: true` above — the standalone
// `saveSchema.index({company_row_id:1})` that used to be here was an exact duplicate
// (Part 2 §2.7).
saveSchema.index({ user_row_id: 1, company_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_watchlists')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_company_watchlists', saveSchema)