const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        unique: true,
        index: true
    },
    sub_admin_row_id: {
        type: Number,
        default: 0
    },
    claim_status: {
        type: Number,
        default: 0
    }, //0 : not claim function - Self Created, 1:Pending, 2:Claimed
    company_name: {
        type: String,
        required: true,
        index: true
    },
    company_id: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    company_email_id: {
        type: String,
        index: true
    },
    company_logo: {
        type: String
    },
    about_company: {
        type: String
    },
    website_link: {
        type: String
    },
    contact_number: {
        type: String
    },
    established_in: {
        type: Date
    },
    nft_wallet_address: {
        type: String
    },
    describe_in_one_line: {
        type: String,
        index: true
    },
    main_business_model_id: {
        type: Number,
        index: true
    },
    business_model_id: {
        type: Object
    },
    investor_model_id: {
        type: Number,
        index: true
    },
    country_id: {
        type: Number,
        index: true
    },
    country_mobile_id: {
        type: Number,
        index: true
    },
    company_location: {
        type: String,
        index: true
    },
    city: {
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
    company_valuation: {
        type: Number
    }, // in USD
    company_size_row_id: {
        type: Number
    },
    investor_category_row_id: {
        type: Number
    },
    approval_sub_admin_row_id: {
        type: Number
    },
    reason_rejected: {
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
    updated_date_n_time: {
        type: Date
    },
    created_date_n_time: {
        type: Date
    },
    approval_status: {
        type: Number,
        default: 0
    }, //0:pending, 1:approved, 2:rejected
    active_status: {
        type: Number,
        default: 1
    }, //0: disable, 1: enable 
    bulk_upload_status: {
        type: Number,
        default: 0
    }, //1: Uploaded
    view_counts: {
        type: Number,
        index: true
    },

    regularities_details: [
        {
            regulatory_bodies_ids: { type: Number },
        }
    ],
    basic_details_score: {
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
    owned_product_score: {
        type: Number,
        default: 0
    },
    team_detail_score: {
        type: Number,
        default: 0
    },
    job_opening_score: {
        type: Number,
        default: 0
    },
    funding_score: {
        type: Number,
        default: 0
    },
    revenue_score_score: {
        type: Number,
        default: 0
    },
    investment_score: {
        type: Number,
        default: 0
    },
    faq_score: {
        type: Number,
        default: 0
    },
    holding_crypto_score: {
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

})

saveSchema.index({ approval_status: 1, active_status: 1 });
saveSchema.index({ approval_status: 1, active_status: 1, followers_count: -1 });
saveSchema.index({ approval_status: 1, active_status: 1, company_valuation: -1 });
saveSchema.index({ approval_status: 1, active_status: 1, business_model_id: 1 });
saveSchema.index({ approval_status: 1, active_status: 1, company_name: "text", company_id: "text" });
saveSchema.index({ main_business_model_id: 1, active_status: 1, approval_status: 1 });
saveSchema.index({ _id: 1, active_status: 1, approval_status: 1 });
saveSchema.index({ _id: 1, approval_status: 1, active_status: 1, country_id: 1 });
saveSchema.index({ _id: 1, approval_status: 1, active_status: 1, company_location: 1 });
saveSchema.index({ latitude: 1, longitude: 1 });

saveSchema.index({ company_id: 1 }, { unique: true });
saveSchema.index({ user_row_id: 1 }, { unique: true });
saveSchema.index({ company_name: 1 });
saveSchema.index({ business_model_id: 1 });
saveSchema.index({ country_id: 1 });
saveSchema.index({ main_business_model_id: 1 });
saveSchema.index({ _id: 1, active_status: 1 });


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_lists')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_lists', saveSchema)
