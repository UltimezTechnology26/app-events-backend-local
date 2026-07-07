const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    attendee_row_id: {
        type: Number
    },
    sg_message_id: {
        type: String,
        index: true
    },
    event_type: {
        type: String
    },
    response: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_emails_events')
        this._id = value
    }
    next()
})

saveSchema.index({ sg_message_id: 1, event_type: 1 });
saveSchema.index({ sg_message_id: 1, _id: -1 });

module.exports = mongoose.model('cln_emails_events', saveSchema)