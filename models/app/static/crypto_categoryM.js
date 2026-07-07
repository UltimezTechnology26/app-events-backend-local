const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    category_name: {
        type: String,
        required: true
    },
    title: {
        type: String
    },
    description: {
        type: String
    },
    category_id: {
        type: String
    },
    cmc_id: {
        type: String
    },
    total_tokens: {
        type: Number
    },
    total_gainers: {
        type: Number
    },
    active_status: {
        type: Boolean,
        default: true
    },
    date_n_time: {
        type: Date
    }
})




saveSchema.index({ category_name: 1, category_id: 1, title: 1 })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_crypto_categories')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_static_crypto_categories', saveSchema) 