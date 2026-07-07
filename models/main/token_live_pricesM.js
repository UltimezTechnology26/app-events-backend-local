const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id:{
        type:Number
    },
    symbol: {
        type:String,
        required:true
    },
    price: {
        type:Number,
        required:true
    },
    usd_24h_change: {
        type:Number,
        required:true
    },
    low_price: {
        type:Number
    },
    high_price: {
        type:Number
    },
    volume: {
        type:Number
    },
    data_from_type:{
        type:Number,
        default:1
    }, // 1:api binance, 2:kucoin, 3:
    date_n_time: {
        type:Date,
        required:true
    }
})

saveSchema.pre('save', async function (next) 
{
    if (!this._id) 
    {
      const value = await getCollectionID('cln_tokens_top_menu_live_prices')
      this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_tokens_top_menu_live_prices', saveSchema)



