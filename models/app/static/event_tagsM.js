const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    event_tag: {
        type: String,
        required: true
    },
    keywords: {
        type: String
    },
    active_status: {
        type: Boolean,
        default: true
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.index({ _id: 1, active_status: 1 });
saveSchema.index({ _id: 1, active_status: 1, event_tag: 1 });
saveSchema.index({ active_status: 1, event_tag: 1 });
saveSchema.index({ active_status: 1, _id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_tags')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_events_tags', saveSchema)