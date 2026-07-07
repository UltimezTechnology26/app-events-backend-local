const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    company_row_id: {
        type: Number,
        index: true
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

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_claim_requests')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_claim_requests', saveSchema)