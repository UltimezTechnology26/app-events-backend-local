const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    category_row_id: {
        type: Number,
        index: true
    },
    notification_type: {
        type: Number,
        index: true
    },
    day_number: {
        type: Number,
        index: true
    },
    title: {
        type: String
    },
    description: {
        type: String
    },
    active_status: {
        type: Number,
        default: 1
    },
    created_on: {
        type: Date
    },
    update_on: {
        type: Date
    },
    pause_on: {
        type: Date
    },
    pause_type: {
        type: Number
    },
    pause_reason: {
        type: String
    },
    sub_admin_row_id: {
        type: Number
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_email_newsletters')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_email_newsletters', saveSchema)