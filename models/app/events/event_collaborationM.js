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
    collaborations_ids: {
        type: Object
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_collaboration_lists')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_events_collaboration_lists', saveSchema)