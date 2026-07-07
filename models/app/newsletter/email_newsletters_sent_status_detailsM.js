const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id:{
        type:Number
    },
    sent_report_row_id:{
        type:Number,
        index: true
    },
    delivered: {
        type:Number
    },
    opens: {
        type:Number
    },
    processed:{
        type:Number
    },
    requests: {
        type:Number
    },
    unique_opens: {
        type:Number
    },
    clicks:{
        type:Number
    },
    blocks: {
        type:Number
    },
    bounce_drops: {
        type:Number
    },
    bounces:{
        type:Number
    },
    deferred: {
        type:Number
    },
    invalid_emails: {
        type:Number
    },
    unique_clicks:{
        type:Number
    },
    unsubscribe_drops: {
        type:Number
    },
    unsubscribes: {
        type:Number
    },
    spam_report_drops:{
        type:Number
    },
    spam_reports: {
        type:Number
    },
    updated_on: {
        type:Date
    }
})

saveSchema.pre('save', async function (next) 
    {
        if (!this._id) 
        {
          const value = await getCollectionID('cln_email_newsletters_sent_status_details')
          this._id = value
        }
        next()
})

module.exports = mongoose.model('cln_email_newsletters_sent_status_details', saveSchema)