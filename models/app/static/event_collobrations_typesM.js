const mongoose = require('mongoose')
const { getCollectionID } = require('../../../config/database_helper')

const saveSchema = mongoose.Schema({
    _id:{
        type:Number
    },
    collobration_name:{
        type:String
    }
})

saveSchema.pre('save', async function (next) 
    {
        if (!this._id) 
        {
          const value = await getCollectionID('cln_static_event_collobrations_types')
          this._id = value
        }
        next()
    })
module.exports = mongoose.model('cln_static_event_collobrations_types', saveSchema)