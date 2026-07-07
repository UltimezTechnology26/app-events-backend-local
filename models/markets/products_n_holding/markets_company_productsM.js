const mongoose = require('mongoose')
const { marketDbIncrement } = require('../../../utils/helpers/database_helper')
const { marketDB } = require('../../../config/database_connector')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_type: {
        type: Number,
        required: true
    },
    company_row_id: {
        type: Number,
        required: true,
        index: true
    },
    register_type: {
        type: Number,
        required: true,
        index: true
    },
    product_type: {
        type: Number,
        required: true,
        index: true
    },
    product_row_id: {
        type: Number,
        required: true,
        index: true
    }, // 1:Crypto token, 2:Blockchain, 3:Exchange
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await marketDbIncrement('cln_company_products')
        this._id = value
    }
    next()
})
module.exports = marketDB.model('cln_company_products', saveSchema)