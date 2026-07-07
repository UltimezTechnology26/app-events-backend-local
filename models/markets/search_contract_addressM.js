const mongoose = require('mongoose')
const { marketDbIncrement } = require('../../utils/helpers/database_helper')
const { marketDB } = require('../../config/database_connector')


const saveSchema = mongoose.Schema({
    _id:{
        type:Number
    },
    sub_admin_row_id: {
        type:Number
    },
    contract_address: {
        type:String,
        index: true
    },
    address_search_status:{
        type:Boolean,
        default:false
    },
    user_requested_status:{
        type:Boolean,
        default:false
    },
    portfolio_wallet_status:{
        type:Boolean,
        default:false
    },
    search_from_type: {
        type:Number
    }, //1:Contract address search, 2:User requested, 3:Search portfolio wallet
    created_token_row_id: {
        type:Number
    }, // linked or disabled token row id
    token_name: {
        type:String,
        required:true,
        index: true
    },
    symbol: {
        type:String,
        required:true,
        index: true
    },
    network_row_id : {
        type:Number,
        index: true
    },
    price: {
        type:Number
    },
    total_supply: {
        type:String
    },
    volume_24h: {
        type:String
    },
    other_blockchain_name: {
        type:String
    },
    view_counts: {
        type:Number,
        index: true
    },
    approved_on:{
        type:Date,
        index: true
    },
    approval_status:{
        type:Number,
        default:0
    }, //0:pending, 1:approved, 2:rejected
    reject_reason: {
        type:String
    },
    reject_type: {
        type:Number
    },
    total_liqiudity:{
        type:Number,
        index: true
    },
    liqiudity_updated_on:{
        type:Date
    },
    liqiudity_updated_status:{
        type:Number,
        default:0
    }, // 0:not updated, 1: update_liquidity, 2:not fetched
    reject_on:{
        type:Date
    },
    rejected_subadmin_id:{
        type:Number
    },
    updated_on: {
        type:Date
    },
    created_on: {
        type:Date,
        index: true
    }
})



saveSchema.pre('save', async function (next) 
{
    if (!this._id) 
    {
      const value = await marketDbIncrement('cln_markets_search_contract_addresses')
      this._id = value
    }
    next()
})



module.exports = marketDB.model('cln_markets_search_contract_addresses', saveSchema)