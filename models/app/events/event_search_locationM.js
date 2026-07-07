const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    city: {
        type: String
    },
    state: {
        type: String
    },
    country: {
        type: String
    },
    registered_users_count: {
        type: Number,
        default: 0
    },
    non_registered_users_count: {
        type: Number,
        default: 0
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_search_locations')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_events_search_locations', saveSchema)