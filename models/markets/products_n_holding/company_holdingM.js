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
    token_type: {
        type: Number,
        index: true
    },// 1:approved token , 2:manual_token
    token_row_id: {
        type: Number,
        required: true,
        index: true
    },
    purchased_date: {
        type: Date
    },
    purchased_value: {
        type: Number
    },
    purchased_value_in_usd: {
        type: Number
    },
    date_n_time: {
        type: Date,
        required: true,
        default: Date.now
    }
})

saveSchema.index({ company_row_id: 1, purchased_value_in_usd: -1 });

saveSchema.index({ company_type: 1, company_row_id: 1 });
saveSchema.index({ company_row_id: 1, token_type: 1, purchased_value_in_usd: -1 });
saveSchema.index({ token_type: 1, company_row_id: 1, token_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_holdings')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_company_holdings', saveSchema)