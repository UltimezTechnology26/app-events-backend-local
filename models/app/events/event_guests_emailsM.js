const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    full_name: {
        type: String
    },
    email_id: {
        type: String
    }
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_guests_emails')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_events_guests_emails', saveSchema)