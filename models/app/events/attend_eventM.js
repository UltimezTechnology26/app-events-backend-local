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
    applied_user_row_id: {
        type: Number,
        index: true
    },
    date_n_time: {
        type: Date
    }
})



saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_event_attendees')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_event_attendees', saveSchema)