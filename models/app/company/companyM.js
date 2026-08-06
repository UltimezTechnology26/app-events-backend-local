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
        type: String
        // index removed: no query anywhere filters/sorts on this field alone —
        // only ever read/projected for display or profile-completeness scoring
        // (confirmed via full-codebase search, Part 2 §2.7).
    },
    main_business_model_id: {
        type: Number,
        index: true
    },
    business_model_id: {
        type: Object
    },
    investor_model_id: {
        type: Number
        // index removed: never queried alone anywhere in the codebase (only
        // appears in the schema and an unrelated BigQuery export mapping) —
        // confirmed dead, not just unused-in-window (Part 2 §2.7).
    },
    country_id: {
        type: Number,
        index: true
    },
    country_mobile_id: {
        type: Number
        // index removed: every occurrence in the codebase is a $lookup
        // localField, a $project, or a write-side assignment — never a
        // $match/find/sort filter (Part 2 §2.7).
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
        type: Date,
        index: true
        // Added Part 3 §7 Phase B step 8, confirmed with the user before adding: .explain()
        // showed the default company_list sort ('recent', used whenever no sort_by param is
        // passed) had zero index support, paying for an in-memory SORT stage (~171ms) unlike
        // the view_counts/company_name sort options (16-19ms, both index-order scans) — this
        // matches that same simple single-field pattern, not a 3-field compound.
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
// Removed: saveSchema.index({ approval_status: 1, active_status: 1, followers_count: -1 })
// `followers_count` is not a schema field and is never written anywhere —
// it only ever exists as a computed $addFields value sourced from
// cln_company_followers, so this index could never structurally serve any
// query (Part 2 §2.7).
saveSchema.index({ approval_status: 1, active_status: 1, company_valuation: -1 });
saveSchema.index({ approval_status: 1, active_status: 1, business_model_id: 1 });
// Removed: saveSchema.index({ approval_status: 1, active_status: 1, company_name: "text", company_id: "text" })
// Confirmed zero `$text` operator usage anywhere in the codebase — all
// search functionality uses $regex instead, so this text index was never
// reachable (Part 2 §2.7).
saveSchema.index({ main_business_model_id: 1, active_status: 1, approval_status: 1 });
saveSchema.index({ _id: 1, active_status: 1, approval_status: 1 });
// Removed: saveSchema.index({ _id: 1, approval_status: 1, active_status: 1, country_id: 1 })
// No query anywhere combines all four fields; the real country-filter query
// path omits `_id` entirely, so this compound was never selectable
// (Part 2 §2.7).
saveSchema.index({ _id: 1, approval_status: 1, active_status: 1, company_location: 1 });
// Removed: saveSchema.index({ latitude: 1, longitude: 1 })
// The geo radius-search feature is real and active (services/company/front_page.ts),
// but it filters on computed lat_num/lon_num fields produced by $addFields+$convert,
// not the raw latitude/longitude fields — this index could never be selected
// by the query planner for that pipeline (Part 2 §2.7).

saveSchema.index({ company_id: 1 }, { unique: true });
saveSchema.index({ user_row_id: 1 }, { unique: true });
saveSchema.index({ company_name: 1 });
saveSchema.index({ business_model_id: 1 });
// country_id and main_business_model_id already have field-level `index: true`
// above (lines 69-72, 58-61) — the two explicit declarations that used to be
// here were exact duplicates of those, confirmed via `getIndexes()` showing
// two indexes on the same single field (Part 1 §3, Part 2 §2.4).
saveSchema.index({ _id: 1, active_status: 1 });


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_lists')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_lists', saveSchema)
