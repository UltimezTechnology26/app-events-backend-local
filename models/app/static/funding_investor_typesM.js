const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    investor_type: {
        type: Number,
        required: true
    }, // 1: User, 2:Company
    category_name: {
        type: String,
        required: true
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_funding_investor_types')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_static_funding_investor_types', saveSchema) 