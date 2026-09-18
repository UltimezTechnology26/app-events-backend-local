const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

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
        required: true,
        default: Date.now
    }
})

// Removed: saveSchema.index({ company_row_id: 1, token_type: 1, token_row_id: 1 })
// referenced `token_type`/`token_row_id`, fields that don't exist anywhere in
// this schema (only `product_type`/`product_row_id` do) — a stale index left
// over from a schema rename, confirmed dead via live index-usage monitoring
// (Part 1 §3, Part 2 §2.4).

saveSchema.index({ company_type: 1, company_row_id: 1 });
saveSchema.index({ company_row_id: 1, register_type: 1, product_type: 1 });
saveSchema.index({ company_row_id: 1, product_type: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_products')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_products', saveSchema)