const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number,
        required: true
    },
    user_row_id: {
        type: Number,
        required: true
    },
    approval_status: {
        type: Number,
        required: true
    }, //0:not employee, 1:pending, 2:approved, 3:rejected
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.index({ company_row_id: 1, user_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_employees_requests')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_employees_requests', saveSchema)
