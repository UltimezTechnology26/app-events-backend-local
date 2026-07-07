const mongoose = require('mongoose')
const { marketDbIncrement } = require('../../../utils/helpers/database_helper')
const { marketDB } = require('../../../config/database_connector')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    wallet_address: {
        type: String,
        index: true
    },
    default_type: {
        type: Boolean,
        default: false
    },
    network_type: {
        type: Number,
        default: 1,
        index: true
    }, // EVM:1, Tron:2, XRP:3, 4:Sol
    nick_name: {
        type: String
    },
    total_nfts: {
        type: Number
    },
    date_n_time: {
        type: Date
    }
})



saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await marketDbIncrement('cln_users_portfolios')
        this._id = value
    }
    next()
})

module.exports = marketDB.model('cln_users_portfolios', saveSchema)