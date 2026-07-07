const mongoose = require('mongoose')
const { marketDbIncrement } = require('../../utils/helpers/database_helper')
const { marketDB } = require('../../config/database_connector')

const saveSchema = mongoose.Schema({
    _id: {
        type:Number
    },
    chain_name: {
        type:String
    },
    chain_symbol: {
        type:String
    },
    chain_id: {
        type:String
    },
    chain_link: {
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
      const value = await marketDbIncrement('cln_chains_manuals')
      this._id = value
    }
    next()
})


module.exports = marketDB.model('cln_chains_manuals', saveSchema)

