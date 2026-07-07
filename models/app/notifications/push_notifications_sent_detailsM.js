const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    notification_type: {
        type: Number
    },
    notification_row_id: {
        type: Number
    },
    notification_status: {
        type: Number,
        default: 1
    }, //1:delivered, 2:opened
    date_n_time: {
        type: Date
    }
},
    {
        versionKey: false
    })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_notifications_push_notify_sents')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_notifications_push_notify_sents', saveSchema)