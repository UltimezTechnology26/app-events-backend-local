const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    notification_row_id: {
        type: Number
    },
    user_row_id: {
        type: Number
    }
},
    {
        versionKey: false
    })

saveSchema.index({ notification_row_id: 1, user_row_id: 1 });
saveSchema.index({ user_row_id: 1, notification_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_notifications_globals')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_notifications_globals', saveSchema)