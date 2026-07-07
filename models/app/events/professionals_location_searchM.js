const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    location_row_id: {
        type: Number,
        index: true
    },
    user_row_id: {
        type: Number,
        index: true
    },
    count: {
        type: Number,
        default: 1,
        index: true
    },
    updated_date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_search_locations')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_professionals_search_locations', saveSchema)