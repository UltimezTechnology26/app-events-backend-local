const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    claim_request_type: {
        type: String
    }, // 1: Without Email ID, 2:Change Email ID
    claim_email_id: {
        type: String
    },
    claim_request_status: {
        type: Number,
        default: 0
    }, // 0:Not Requested, its reserved for self created users, 1:Pending, 2:Accepted, 3:Rejected
    claim_rejected_reason: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_claim_requests')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_claim_requests', saveSchema)