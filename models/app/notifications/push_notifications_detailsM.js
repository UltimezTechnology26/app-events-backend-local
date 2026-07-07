

const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        unique: true,
        required: true
    },
    push_notification_status: {
        type: Number,
        default: 1
    }, //1:on, 2:off
    updated_on: {
        type: Date
    }
},
    {
        versionKey: false
    })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_push_notifications_details')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_push_notifications_details', saveSchema)