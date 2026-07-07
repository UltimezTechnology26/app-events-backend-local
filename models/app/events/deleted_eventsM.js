const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
        // ,required:true
    },
    event_title: {
        type: String
    },
    company_row_id: {
        type: Number,
        default: 0,
        index: true
    },
    event_tags: {
        type: Object
    },
    event_type: {
        type: Number,
        default: 2
    },//1:Seminar, 2:Webinar, 3:Hybrid
    event_city: {
        type: String
    },
    event_venue: {
        type: String
    },
    event_url: {
        type: String
    },
    event_link: {
        type: String
    },
    start_date: {
        type: Date
    },
    end_date: {
        type: Date
    },
    event_description: {
        type: String
    },
    contact_user_name: {
        type: String
    },
    contact_mobile_number: {
        type: String
    },
    contact_country_row_id: {
        type: Number,
        index: true
    },
    contact_email_id: {
        type: String
    },
    active_status: {
        type: Number,
        default: 1
    },//0: Disabled, 1: Enabled
    approval_status: {
        type: Number,
        default: 0
    }, //0:pending, 1:approved, 2:rejected
    webinar_meeting_type: {
        type: Number,
        default: 0
    },//0: Disabled, 1: Enabled
    webinar_meeting_link: {
        type: String
    },//0: Disabled, 1: Enabled
    list_event_type: {
        type: Number,
        default: 1
    },//1:user, 2:company, 3:both
    deleted_reason: {
        type: String
    },
    deleted_date_n_time: {
        type: Date
    },
    created_by_admin_status: {
        type: Number
    }, //0: user created 1: admin created, 2:sub admin
    created_by_sub_admin_id: {
        type: Number
    },
    date_n_time: {
        type: Date
    },
    longitude: {
        type: String
    },
    latitude: {
        type: String
    },
    utc_row_id: {
        type: Number
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_deleted_events')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_deleted_events', saveSchema)