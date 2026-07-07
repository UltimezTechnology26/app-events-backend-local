const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id:{
        type:Number
    },
    company_row_id: {
        type:Number
    }
})

saveSchema.pre('save', async function (next) 
{
    if (!this._id) 
    {
      const value = await getCollectionID('cln_company_podcast_status')
      this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_podcast_status', saveSchema)