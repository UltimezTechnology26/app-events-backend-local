const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number
    },//1:mobile, 2:browser
    device_type: {
        type: String
    },
    device_id: {
        type: String
    },
    os_version: {
        type: String
    },
    device_model: {
        type: String
    },
    app_version: {
        type: String,
    },
    platform: {
        type: String,
    },
    app_installed_date: {
        type: Date
    },
    fcm_token: {
        type: String
    },
    timezone: {
        type: String
    },
    notification_status: {
        type: Number,
        default: 1
    },
    country: {
        type: String,
        default: 0
    }, //0:pending 1: seen
    language: {
        type: String
    },
    updated_on: {
        type: Date
    },
    date_n_time: {
        type: Date
    }
},
    {
        versionKey: false
    })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_notifications_push_notify_details')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_notifications_push_notify_details', saveSchema)