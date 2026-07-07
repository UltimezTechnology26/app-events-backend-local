const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number
    },
    user_row_id: {
        type: Number
    },
    date_n_time: {
        type: Date
    }, // needs to 
    approval_status: {
        type: Number,
        default: 0
    }, //0:pending, 1:approved, 2:rejected
    rejected_reason: {
        type: String
    },
    approval_date_n_time: {
        type: Date
    }
})

saveSchema.index({ company_row_id: 1, user_row_id: 1 }, { unique: true })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_requests_to_partners')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_requests_to_partners', saveSchema)