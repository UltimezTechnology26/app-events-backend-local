const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number
    },
    thread_type: {
        type: Number
    },//1:single, 2:multi thread
    notify_type: {
        type: Number
    }, //1:users, 2:company, 3:events, 4:courses, 5:lessons, 6:weekly contest, 7:users claim emails, 11:markets tokens
    notify_type_row_id: {
        type: Number
    }, // id of user or company or event or market token 
    message_row_id: {
        type: Number,
        default: 0
    },
    action_row_id: {
        type: Number,
        default: 0
    },
    event_row_id: {
        type: Number
    },//use only when user or company there in notify type 
    token_row_id: {
        type: Number
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
    description: {
        type: String
    },
    view_status: {
        type: Number,
        default: 0
    }, //0:pending 1: seen
    date_n_time: {
        type: Date
    }
},
    {
        versionKey: false
    })

saveSchema.index({ user_row_id: 1, _id: -1 });
saveSchema.index({ user_row_id: 1, thread_type: 1, notify_type: 1, _id: 1 });
saveSchema.index({ message_row_id: 1 });
saveSchema.index({ thread_type: 1, notify_type: 1, notify_type_row_id: 1 });
saveSchema.index({ user_row_id: 1, view_status: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_notifications')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_notifications', saveSchema)