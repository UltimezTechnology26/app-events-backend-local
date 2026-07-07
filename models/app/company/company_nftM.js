const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number
    },
    // nft_data: {
    //     type:Object
    // }
    image_url: {
        type: String
    },
    token_id: {
        type: String
    },
    nft_name: {
        type: String
    },
    nft_description: {
        type: String
    },
    asset_contract_address: {
        type: String
    },
    asset_collection_name: {
        type: String
    },
    asset_contract_schema_name: {
        type: String
    },
    asset_contract_owner: {
        type: String
    },
    owner_profile_img_url: {
        type: String
    },
    creator_address: {
        type: String
    },
    current_price: {
        type: String
    },
    payment_token_contract_symbol: {
        type: String
    },
    payment_token_contract_decimals: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_wallet_address_nfts')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_wallet_address_nfts', saveSchema)