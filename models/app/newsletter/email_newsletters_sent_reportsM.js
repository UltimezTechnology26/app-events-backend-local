const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    newsletter_row_id: {
        type: Number,
        index: true
    },
    sent_date: {
        type: String
    },
    created_on: {
        type: Date
    }
})

// Guarantees only one send per newsletter per day even if the cron fires
// concurrently from more than one process/instance.
saveSchema.index({ newsletter_row_id: 1, sent_date: 1 }, { unique: true })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_email_newsletters_sent_reports')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_email_newsletters_sent_reports', saveSchema)