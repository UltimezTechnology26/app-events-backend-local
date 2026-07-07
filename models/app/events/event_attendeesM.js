const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    event_row_id: {
        type: Number,
        index: true
    },
    user_type: {
        type: Number,
        default: 1,
        index: true
    }, //1:cln_professionals, 2:manual_retrievals 
    user_row_id: {
        type: Number,
        index: true
    },
    sg_message_id: {
        type: String,
        index: true
    },
    email_day_number: {
        type: Number,
        default: 0
    }, //0:Now, 1>= day number
    email_sent_status: {
        type: Boolean,
        default: false
    },
    invitation_status: {
        type: Number,
        default: 0
    }, //0:invitation pending, 1:Accepted, 2:rejected
    invitation_type: {
        type: Number,
        default: 1
    }, //1. User registered  2. Added by host
    reminder_type: {
        type: Number,
        // default: 0
    },
    reminder_email_sent_status: {
        type: Boolean,
        default: false
    },
    reminder_time: {
        type: Date
    },
    created_date_n_time: {
        type: Date
    }
})

saveSchema.index({ event_row_id: 1, user_type: 1, user_row_id: 1, invitation_status: 1 });

saveSchema.index({ event_row_id: 1, email_day_number: 1, email_sent_status: 1 });
saveSchema.index({ user_type: 1, user_row_id: 1, invitation_status: 1 });
saveSchema.index({ event_row_id: 1, invitation_status: 1 });
saveSchema.index({ event_row_id: 1, user_type: 1, invitation_status: 1 });
saveSchema.index({ sg_message_id: 1 });
saveSchema.index({ email_day_number: 1, email_sent_status: 1 });
saveSchema.index({ reminder_email_sent_status: 1, reminder_time: 1 });
saveSchema.index({ event_row_id: 1 });
saveSchema.index({ event_row_id: 1, user_row_id: 1, user_type: 1 });

saveSchema.index({ event_title: "text", event_url: "text", attendee_user_name: "text", attendee_full_name: "text", attendee_email_id: "text", host_user_name: "text", host_full_name: "text", host_company_name: "text", host_company_id: "text" });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_attendees')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_events_attendees', saveSchema)