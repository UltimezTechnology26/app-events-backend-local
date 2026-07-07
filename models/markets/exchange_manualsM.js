const mongoose = require('mongoose')
const { marketDbIncrement } = require('../../utils/helpers/database_helper')
const { marketDB } = require('../../config/database_connector')

const saveSchema = mongoose.Schema({
    _id: {
        type:Number
    },
    exchange_name: {
        type:String
    },
    exchange_image: {
        type:String
    },
    launch_date: {
        type:Date
    },
    volume_24h: {
        type:Number
    },
    exchange_link: {
        type:String
    },
    view_counts: {
        type:Number
    },
    approval_status: {
        type:Number, 
        default:0
    },//0:pending, 1:approved, 2:rejected
    created_on: {
        type:Date
    }
}, { versionKey: false })



saveSchema.pre('save', async function (next) 
{
    if (!this._id) 
    {
      const value = await marketDbIncrement('cln_exchanges_manuals')
      this._id = value
    }
    next()
})


module.exports = marketDB.model('cln_exchanges_manuals', saveSchema)

