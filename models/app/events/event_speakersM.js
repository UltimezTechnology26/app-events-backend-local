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
    user_type: {
        type: Number,
        index: true
    }, //1:registered user id, 2: manual speakers id
    user_row_id: {
        type: Number,
        index: true
    },// cln_professionals or cln_professionals_manual_retrievals
    requested_status: {
        type: Number,
        default: 3
        // // 0: Pending, 1: Accepted, 2: Rejected //3:host added
    },
    date_n_time: {
        type: String
    }
})
saveSchema.index({ user_row_id: 1, user_type: 1 });
saveSchema.index({ user_row_id: 1, user_type: 1, event_row_id: 1 });
saveSchema.index({
    user_type: 1,
    event_row_id: 1,
    user_row_id: 1
})
saveSchema.index({ event_row_id: 1, requested_status: 1 });
saveSchema.index({ event_row_id: 1, user_type: 1, requested_status: 1 });
saveSchema.index({ event_row_id: 1, user_row_id: 1, requested_status: 1 });
saveSchema.index({ user_type: 1, event_row_id: 1 });
saveSchema.index({ event_row_id: 1 });
saveSchema.index({ event_row_id: 1, user_row_id: 1, user_type: 1, requested_status: { $in: [1, 3] } });
saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_speakers')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_events_speakers', saveSchema)