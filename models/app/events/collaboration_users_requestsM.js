const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number
    },
    event_row_id: {
        type: Number
    },
    collaborations_ids: {
        type: Object
    },

    requested_status: {
        type: Number,
        default: 3
    },
    updated_on: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_collaboration_professionals_requests')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_events_collaboration_professionals_requests', saveSchema)