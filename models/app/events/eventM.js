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
        type: String,
        required: true,
        index: true
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
        default: 2,
        required: true,
        index: true
    },//1:Seminar, 2:Webinar, 3:Hybrid
    event_image: {
        type: String
    },
    alt_image_text: {
        type: String
    },
    event_city: {
        type: String
    },
    event_state: {
        type: String
    },
    event_venue: {
        type: String
    },
    event_url: {
        type: String,
        index: true
    },
    event_link: {
        type: String
    },
    event_image_type: {
        type: Number,
        default: 0
    },
    start_date: {
        type: Date,
        required: true,
        index: true
    },
    end_date: {
        type: Date,
        required: true,
        index: true
    },
    event_description: {
        type: String
    },
    event_brief: {
        type: String
    },
    describe_in_one_line: {
        type: String,
        index: true
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
    event_price: {
        type: Number,
        default: -1
    },// -1: tickets not update, 0:Updated but ticket is free, Greater than 0 ticket price
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
        default: 1,
        index: true
    },//1:user, 2:company, 3:both
    reason_for_reject: {
        type: String
    },
    rejected_date_n_time: {
        type: Date
    },
    disable_reason: {
        type: String
    },
    disabled_date_n_time: {
        type: Date
    },
    created_by_admin_status: {
        type: Number,
        default: 0
    }, //0: user created 1: admin created, 2:sub admin
    created_by_sub_admin_id: {
        type: Number
    },
    created_date_n_time: {
        type: Date
    },
    meta_keywords: {
        type: String
    },
    meta_description: {
        type: String
    },
    meta_title: {
        type: String
    },
    longitude: {
        type: String
    },
    latitude: {
        type: String
    },
    utc_row_id: {
        type: Number
    },
    view_counts: {
        type: Number,
        index: true
    },
    ticket_link: {
        type: String
    },
    event_card_image: {
        type: String
    },
    build_event_page_score: {
        type: Number,
        default: 0
    },
    seo_details_score: {
        type: Number,
        default: 0
    },
    contact_details_score: {
        type: Number,
        default: 0
    },
    tickets_coupons_score: {
        type: Number,
        default: 0
    },
    speakers_score: {
        type: Number,
        default: 0
    },
    sponsors_partners_score: {
        type: Number,
        default: 0
    },
    attendees_score: {
        type: Number,
        default: 0
    },
    faq_score: {
        type: Number,
        default: 0
    },
    profile_score: {
        type: Number,
        default: 0
    },
    robots_index: {
        type: String,
        enum: ["index", "noindex"],
        default: "index"
    },
    robots_follow: {
        type: String,
        enum: ["follow", "nofollow"],
        default: "follow"
    },
    og_title: {
        type: String,
        default: ""
    },
    og_description: {
        type: String,
        default: ""
    },
    twitter_title: {
        type: String,
        default: ""
    },
    twitter_description: {
        type: String,
        default: ""
    },
    twitter_creator: {
        type: String,  // Example: @username
        default: ""
    },
    updated_by: {
        type: String,
        enum: ['user', 'subadmin', 'admin'],
        default: null
    },
    updated_by_row_id: {
        type: Number,
        default: null
    },

    updated_date_n_time: {
        type: Date,
    },
    header_structure: {
        type: [
            {
                tag: String,
                text: String
            }
        ],
        default: []
    }
})


// Core filtering indexes - most commonly used
saveSchema.index({ active_status: 1, approval_status: 1 });
saveSchema.index({ active_status: 1, approval_status: 1, start_date: 1, end_date: 1 });
saveSchema.index({ active_status: 1, approval_status: 1, event_title: "text", event_tags: "text" });
saveSchema.index({ _id: 1, active_status: 1, approval_status: 1 });
saveSchema.index({ event_url: 1, active_status: 1, approval_status: 1 });
saveSchema.index({ user_row_id: 1, active_status: 1, approval_status: 1 });
saveSchema.index({ company_row_id: 1, active_status: 1, approval_status: 1 });
saveSchema.index({ active_status: 1, approval_status: 1, event_type: 1 });
saveSchema.index({ active_status: 1, approval_status: 1, event_price: 1 });
saveSchema.index({ active_status: 1, approval_status: 1, view_counts: -1 });
saveSchema.index({ active_status: 1, approval_status: 1, start_date: -1 });
saveSchema.index({ latitude: 1, longitude: 1 });
saveSchema.index({ _id: 1, user_row_id: 1 });
saveSchema.index({ active_status: 1, approval_status: 1, list_event_type: 1 });
saveSchema.index({ active_status: 1, approval_status: 1, event_venue: "text" });
saveSchema.index({ active_status: 1, approval_status: 1, event_tags: 1 });
saveSchema.index({ active_status: 1, approval_status: 1, end_date: -1 });


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_events', saveSchema)