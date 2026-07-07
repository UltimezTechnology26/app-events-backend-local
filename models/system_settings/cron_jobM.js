const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id:{
        type:Number
    },
    type: {
        type:Number
    }, // 1 = user_podcast, 2 = company_podcast, 3 = usernft, 4 = companynft
    date_n_time: {
        type:Date
    }
})

saveSchema.pre('save', async function (next) 
{
    if (!this._id) 
    {
        const value = await getCollectionID('cln_cron_jobs')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_cron_jobs', saveSchema)