const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
        _id:{
            type:Number
        },
        manual_account_type:{
            type:Number
        },//1.user 2. company
        name:{
            type:String
        },
        image:{
            type:String
        },
        link:{
            type:String
        },
        users_email_id:{
            type:String
        }
    })

    saveSchema.pre('save', async function (next) 
    {
        if (!this._id) 
        {
          const value = await getCollectionID('cln_events_manual_user_companies')
          this._id = value
        }
        next()
    })
module.exports = mongoose.model('cln_events_manual_user_companies', saveSchema)