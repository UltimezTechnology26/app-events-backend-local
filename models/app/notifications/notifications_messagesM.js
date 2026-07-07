const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    title: {
        type: String
    },
    notification_message: {
        type: String
    }
}, {
    versionKey: false
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_notifications_messages')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_notifications_messages', saveSchema)