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
    total_attendees: {
        type: Number,
        default: 0,
        index: true
    },
    total_invitees: {
        type: Number,
        default: 0,
        index: true
    },
    total_watchlist: {
        type: Number,
        default: 0,
        index: true
    }
})

saveSchema.index({ event_row_id: 1 });
saveSchema.index({ event_row_id: 1, total_attendees: -1 });
saveSchema.index({ event_row_id: 1, total_watchlist: -1 });
saveSchema.index({ event_row_id: 1, total_invitees: -1 });
saveSchema.index({ event_row_id: 1, total_attendees: 1, total_watchlist: 1, total_invitees: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_event_counts')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_event_counts', saveSchema)