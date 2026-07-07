const mongoose = require('mongoose')
const { getCollectionID } = require('../../../config/database_helper')

const saveSchema = mongoose.Schema({
    _id:{
        type:Number
    },
    list_type: {
        type:Number,
        default:2
    }, // 1 = Coin 2 = Token
    contract_addresses: {
        type:Object
    },
    category_row_id : {
        type:Number
    }, //main category
    categories: {
        type:Object
    },
    token_id: {
        type:String,
        unique: true
    },
    token_name: {
        type:String,
        required:true
    },
    symbol: {
        type:String,
        required:true
    },
    token_image: {
        type:String
    },
    active_status: {
        type:Number,
        required:true,
        default:1
    }, // 0 = disabled, 1 = enabled
    disable_type: {
        type:Number
    },
    disable_reason: {
        type:String
    },
    disable_subadmin_id: {
        type:Number
    },
    disable_on: {
        type:Date
    },
    price: {
        type:Number
    },
    percent_change_1h: {
        type:Number
    },
    percent_change_24h: {
        type:Number
    },
    percent_change_7d: {
        type:Number
    },
    marketcap: {
        type:Number,
        default:0
    },
    total_supply: {
        type:Number,
        default:0
    },
    max_supply: {
        type:Number,
        default:0
    },
    circulating_supply: {
        type:Number,
        default:0
    },
    volume: {
        type:Number
    },
    coinmarketcap_id: {
        type:Number
    },
    high_24h: {
        type:Number
    },
    low_24h: {
        type:Number
    },
    updated_on: {
        type:Date
    },
    created_on: {
        type:Date
    },
    view_counts: {
        type:Number
    },
    cmc_rank: {
        type:Number
    },
    cp_rank: {
        type:Number
    },
    trending_number: {
        type:Number
    },
    fetch_data_type: {
        type:Number
    }, //2:bitquery
    coin_display_type: {
        type:Number
    },//new coin:1, stable coins:2, trending coin:3
    liquidity_data_status: {
        type:Number
    },
    list_price_prediction_status: {
        type:Number
    }, //CP Main 
    user_row_id: {
        type:Number
    },
    liquidity:{
        type:Number
    },
    liquidity_updated_on:{
        type:Date
    },
    liquidity_updated_status:{
        type:Number,
        default:0,
    }, // 0:not updated, 1: update_liquidity, 2:not fetched
    subadmin_row_id: {
        type:Number
    },
    approval_status: {
        type:Number,
        default:0
    }, // 0:pending, 1:approved, 2:rejected
    rejected_reason: {
        type:String
    },
    rejected_on: {
        type:Date
    },
})

saveSchema.index({ token_name: 1, symbol: 1 })


saveSchema.pre('save', async function (next) 
{
    if (!this._id) 
    {
      const value = await getCollectionID('cln_markets_tokens')
      this._id = value
    }
    next()
})



module.exports = mongoose.model('cln_markets_tokens', saveSchema)