const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number
    },
    // wallet_network_type: {
    //     type:Number 
    // }, //1: Metamask 2: MyEtherWallet 3: Binance
    wallet_address: {
        type: String
    },
    // nick_name: {
    //     type:String
    // },
    date_n_time: {
        type: Date
    }
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_wallet_addresses')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_wallet_addresses', saveSchema)