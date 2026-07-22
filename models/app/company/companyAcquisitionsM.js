const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    acquirer_registered_type: {
        type: Number,
        index: true
    }, // 1: registered company, 2: manual/unclaimed entry
    acquirer_company_row_id: {
        type: Number,
        index: true
    },
    acquired_registered_type: {
        type: Number,
        index: true
    },
    acquired_company_row_id: {
        type: Number,
        index: true
    },
    acquisition_date: {
        type: Date
    },
    acquisition_price: {
        type: Number
    },
    facilitators: {
        type: String
    },
    stake_acquired_percent: {
        type: Number
    },
    acquisition_multiple: {
        type: Number
    },
    verified_status: {
        type: Number,
        default: 0
    }, // 0: Pending, 1: Approved, 2: Rejected
    verified_on: {
        type: Date
    },
    reject_type: {
        type: Number
    },
    reject_reason: {
        type: String
    },
    submitted_by_type: {
        type: Number
    }, // 1: admin, 2: company owner
    date_n_time: {
        type: Date
    }
})

saveSchema.index({ acquirer_company_row_id: 1, acquirer_registered_type: 1, verified_status: 1 })
saveSchema.index({ acquired_company_row_id: 1, acquired_registered_type: 1, verified_status: 1 })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_acquisitions')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_company_acquisitions', saveSchema)
