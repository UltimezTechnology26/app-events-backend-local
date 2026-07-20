const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    referral_row_id: {
        type: Number
    },
    referral_user_name: {
        type: String
    },
    sub_admin_row_id: {
        type: Number,
        default: 0
    },
    claim_status: {
        type: Number,
        default: 0
    }, //0 : not claim function - Self Created, 1:Pending, 2:Claimed
    user_name: {
        type: String,
        sparse: true,
        index: true
    },
    // profile_image : {
    //     type:String
    // },
    full_name: {
        type: String,
        index: true
    },
    about_in_one_line: {
        type: String
    },
    gender: {
        type: Number,
        default: 0
    }, //1:male, 2:female, 3:others
    email_id: {
        type: String,
        index: true
    },
    email_verify_status: {
        type: Boolean,
        default: false
    },
    mobile_number: {
        type: String
    },
    country_id: {
        type: Number,
        index: true
    },
    country_mobile_id: {
        type: Number,
        index: true
    },
    location: {
        type: String
    },
    area: {
        type: String
    },
    city: {
        type: String
    },
    country_name: {
        type: String
    },
    state: {
        type: String
    },
    longitude: {
        type: String
    },
    latitude: {
        type: String
    },
    location_country: {
        type: String
    },
    account_visible_type: {
        type: Number,
        default: 2
    }, //1:private, 2:public
    designation_id: {
        type: Object,
        index: true
    },
    login_status: {
        type: Number,
        default: 1
    }, //0:disabled, 1:enabled, 2:deleted
    approval_status: {
        type: Number,
        default: 0
    }, //0:pending, 1:approved, 2:rejected
    reason_rejected: {
        type: String
    },
    rejected_date_n_time: {
        type: Date
    },
    deleted_date_n_time: {
        type: Date
    },
    view_counts: {
        type: Number
    },
    created_date_n_time: {
        type: Date
    },
    wallet_address: {
        type: String
    },

    vcf_status: {
        type: Number,
        default: 0
    }, //  0.vcf disable 1.vcf enable
    user_bio: {
        type: String
    },
    looking_for_id: {
        type: Object
    },
    pro_batch: {
        type: Boolean,
        default: false
    },
    professional_profile_score: {
        type: Number,
        default: 0
    },
    seo_details_score: {
        type: Number,
        default: 0
    },
    social_media_score: {
        type: Number,
        default: 0
    },
    academy_score: {
        type: Number,
        default: 0
    },
    community_score: {
        type: Number,
        default: 0
    },
    professional_detail_score: {
        type: Number,
        default: 0
    },
    investment_score: {
        type: Number,
        default: 0
    },
    award_score: {
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
        type: Date
    },
    disabled_date_n_time: {
        type: Date
    },

})

// Essential indexes for all user queries
saveSchema.index({ _id: 1, user_name: 1, full_name: 1 });
saveSchema.index({ _id: 1, email_id: 1 });
saveSchema.index({ full_name: 1, user_name: 1 });
saveSchema.index({ _id: 1, login_status: 1 });

// Compound indexes for optimized queries
saveSchema.index({ approval_status: 1, login_status: 1 });
saveSchema.index({ approval_status: 1, login_status: 1, _id: 1 });
saveSchema.index({ approval_status: 1, login_status: 1, designation_id: 1 });
saveSchema.index({ approval_status: 1, login_status: 1, user_name: 1, full_name: 1 });
saveSchema.index({ approval_status: 1, login_status: 1, email_id: 1 });
saveSchema.index({ login_status: 1, user_name: 1, full_name: 1 }); // For user suggestions
saveSchema.index({ login_status: 1, approval_status: 1 }); // login_status-led: serves $or branches that constrain login_status without approval_status (e.g. admin_panel/app/user.js list/count filters)

// Text search indexes for regex search optimization
saveSchema.index({ user_name: "text", full_name: "text" });
saveSchema.index({ approval_status: 1, login_status: 1, user_name: "text" });
saveSchema.index({ approval_status: 1, login_status: 1, full_name: "text" });
saveSchema.index({ approval_status: 1, login_status: 1, full_name: "text", email_id: "text" }); // For user suggestions

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_professionals', saveSchema) 