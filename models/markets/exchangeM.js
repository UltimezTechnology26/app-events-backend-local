const mongoose = require('mongoose')
const { marketDbIncrement } = require('../../utils/helpers/database_helper')
const { marketDB } = require('../../config/database_connector')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    exchange_name: {
        type: String
    },
    exchange_slug: {
        type: String,
        index: true
    },
    exchange_image: {
        type: String
    },
    total_pairs: {
        type: Number
    },
    total_coins: {
        type: Number
    },
    cmc_id: {
        type: Number
    },
    gecko_id: {
        type: String
    },
    volume_24h: {
        type: Number
    },

    launch_date: {
        type: Date
    },
    fiat_currency: {
        type: Object
    },
    spot_listed_status: {
        type: Number,
        default: 0
    },// 0:not listed, 1:listed
    future_listed_status: {
        type: Number,
        default: 0
    },// 0:not listed, 1:listed
    status: {
        type: Number,
        default: 1
    }, // 0:disabled, 1:enabled
    disable_reason: {
        type: String
    },
    enable_disable_on: {
        type: Date
    },
    updated_on: {
        type: Date

    },
    date_n_time: {
        type: Date
    },
    created_date_n_time: {
        type: Date,
    },
    updated_date_n_time: {
        type: Date,
    },
    general_info_score: {
        type: Number,
        default: 0
    },
    social_links_score: {
        type: Number,
        default: 0
    },
    trust_score: {
        type: Number,
        default: 0
    },
    seo_score: {
        type: Number,
        default: 0
    },
    owning_companies_score: {
        type: Number,
        default: 0
    },
    profile_score: {
        type: Number,
        default: 0
    },
    website_link: {
        type: String
    },
    twitter_link: {
        type: String
    },
    telegram_link: {
        type: String
    },

    fees_link: {
        type: String
    },
    medium: {
        type: String
    },
    facebook: {
        type: String
    },
    reddit: {
        type: String
    },
    description: {
        type: String
    },
    founder_user_row_id: {
        type: Number
    },
    founder_user_type: {
        type: Number
    },
    exchange_email_id: {
        type: String
    },
    launch_date: {
        type: Date
    },
    sub_admin_row_id: {
        type: Number
    },
    created_by: {
        type: String,
        enum: ['user', 'subadmin', 'admin'],
    },
    restricted_country_array: {
        type: Object,
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
}, { versionKey: false })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await marketDbIncrement('cln_exchanges')
        this._id = value
    }
    next()
})



module.exports = marketDB.model('cln_exchanges', saveSchema)

