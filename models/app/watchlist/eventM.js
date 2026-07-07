const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    event_row_id: {
        type: Number,
        required: true
    },
    user_row_id: {
        type: Number
    },
    reminder_type: {
        type: Number,
        // default: 0
    },
    email_sent_status: {
        type: Boolean,
        default: false
    },
    reminder_time: {
        type: Date
    },


    date_n_time: {
        type: Date
    }
})

saveSchema.index({ event_row_id: 1, user_row_id: 1 });

saveSchema.index({ user_row_id: 1 });
saveSchema.index({ event_row_id: 1 });
saveSchema.index({ user_row_id: 1, event_row_id: 1, _id: 1 });
saveSchema.index({ reminder_type: 1, email_sent_status: 1 });
saveSchema.index({ reminder_time: 1, email_sent_status: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_event_watchlists')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_event_watchlists', saveSchema)