const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    event_row_id: {
        type: Number,
        index: true
    },
    country_id: {
        type: Number,
        index: true
    },
    contact_number: {
        type: String
    },
    email_id: {
        type: String
    },
    contact_type: {
        type: Number,
        default: 9
    },
    contact_reason: {
        type: String
    }
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_event_contacts')
        this._id = value
    }
    next()
})

saveSchema.index({ event_row_id: 1 });
saveSchema.index({ event_row_id: 1, contact_type: 1, country_id: 1 });
module.exports = mongoose.model('cln_event_contacts', saveSchema)