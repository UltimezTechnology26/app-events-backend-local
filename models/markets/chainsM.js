const mongoose = require('mongoose')
const { marketDbIncrement } = require('../../utils/helpers/database_helper')
const { marketDB } = require('../../config/database_connector')

const tokenSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    token_row_id: {
        type: Number,
        index: true
    },
    static_network_row_id: {
        type: Number,
        index: true
    },
    chain_name: {
        type: String,
        unique: true
    },
    chain_image: {
        type: String
    },
    chain_slug: {
        type: String,
        unique: true
    },
    chain_id: {
        type: Number
    },
    gecko_id: {
        type: String
    },
    cmc_id: {
        type: Number
    },
    tvl: {
        type: Number,
        // index:true
    },
    protocols: {
        type: Number
    },
    mcap: {
        type: Number
    },
    tps: {
        type: Number
    },
    total_fees: {
        type: Number
    },
    total_fees_in_usd: {
        type: Number
    },
    total_transaction: {
        type: Number
    },
    last_24hr_transaction: {
        type: Number
    },
    last_24hr_fees: {
        type: Number
    },
    last_24hr_blocks: {
        type: Number
    },
    blockchain_types: {
        type: Object
    },
    status: {
        type: Number,
        default: 1
    },// 0:disabled, 1:enbled
    disable_reason: {
        type: String
    },
    enable_disable_on: {
        type: Date
    },
    date_n_time: {
        type: Date
    },
    created_date_n_time: {
        type: Date
    },
    stats_updated_date_n_time: {
        type: Date
    },
    updated_date_n_time: {
        type: Date
    },
    last_updated_time: {
        type: Date
    },
    updated_on: {
        type: Date
    },
    general_info_score: {
        type: Number,
        default: 0
    },
    social_links_score: {
        type: Number,
        default: 0
    },
    owning_companies_score: {
        type: Number,
        default: 0
    },
    seo_score: {
        type: Number,
        default: 0
    },
    profile_score: {
        type: Number,
        default: 0
    },
    total_block: {
        type: Number
    },
    last_block_size: {
        type: Number
    },
    last_block_height: {
        type: Number
    },
    last_24h_volume: {
        type: Number
    },
    network_difficulty: {
        type: Number
    },
    total_active_addresses: {
        type: Number
    },
    explorers: {
        type: Object
    },
    websites: {
        type: Object
    },
    website_link: {
        type: String
    },
    telegram_link: {
        type: String
    },
    twitter_link: {
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
    sub_admin_row_id: {
        type: Number
    },
    created_by: {
        type: String,
        enum: ['user', 'subadmin', 'admin', 'defillama'],
    },
    updated_by: {
        type: String,
        enum: ['user', 'subadmin', 'admin', 'defillama'],
        default: null
    },
    updated_by_row_id: {
        type: Number,
        default: null
    },
}, { versionKey: false })





tokenSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await marketDbIncrement('cln_chains')
        this._id = value
    }
    next()
})
module.exports = marketDB.model('cln_chains', tokenSchema)