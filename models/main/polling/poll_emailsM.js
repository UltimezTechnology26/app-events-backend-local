const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    article_id: {
        type: Number
    },
    email_id: {
        type: String,
        required: true
    },
    ip_address: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_article_polling_emails')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_article_polling_emails', saveSchema)
