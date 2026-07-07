const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    notify_type: {
        type: Number
    },
    notification_row_id: {
        type: Number
    },
    notify_type_row_id: {
        type: Number
    }, // id of user or company or event or market token 
    action_row_id: {
        type: Number,
        default: 0
    },
    description: {
        type: String
    },
    notify_image: {
        type: String
    },
    notify_name: {
        type: String
    },
    notify_id: {
        type: String
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
        const value = await getCollectionID('cln_notifications_threads')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_notifications_threads', saveSchema)