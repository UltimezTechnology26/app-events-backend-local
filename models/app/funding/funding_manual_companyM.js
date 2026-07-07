const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id:{
        type:Number
    },
    company_name: {
        type:String
    },
    website: {
        type:String
    },
    company_email_id: {
        type:String
    }
})



saveSchema.pre('save', async function (next) 
{
    if (!this._id) 
    {
      const value = await getCollectionID('cln_funding_manual_companies')
      this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_funding_manual_companies', saveSchema)