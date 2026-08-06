const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number
    },
    company_row_id: {
        type: Number
    },
    claim_type: {
        type: Number
    }, // 1: Same Email ID, 2: Different Email ID but same Domain, 3:Same domain - If email id not there
    claim_status: {
        type: Number,
        default: 0
    }, // 0:Not Requested, 1:Pending, 2:Accepted, 3:Rejected
    claim_action_date_n_time: {
        type: Date
    },
    claim_rejected_reason: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

// Confirmed via evidence: add_new_claim_request's duplicate-check ({user_row_id, company_row_id,
// claim_status:1}) runs on every claim submission (a hot, race-prone path — same class as the
// watchlist duplicate-check fixed earlier this engagement). Replaces the two standalone
// single-field indexes above, which covered no query shape actually run against this collection.
saveSchema.index({ user_row_id: 1, company_row_id: 1, claim_status: 1 })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_claim_requests')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_claim_requests', saveSchema)