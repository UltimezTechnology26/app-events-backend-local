const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    category_row_id: {
        type: Number,
        index: true
    },
    subscribe_status: {
        type: Number,
        default: 1
    }, // 1:subscribed , 2:unsubscribed
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_subscribe_to_categories')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_subscribe_to_categories', saveSchema)