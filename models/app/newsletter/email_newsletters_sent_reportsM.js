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
    created_on: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_email_newsletters_sent_reports')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_email_newsletters_sent_reports', saveSchema)