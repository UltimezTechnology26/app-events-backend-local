const mongoose = require('mongoose')
const { marketDbIncrement } = require('../../utils/helpers/database_helper')
const { marketDB } = require('../../config/database_connector')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number,
    },
    list_type: {
        type: String,
        default: 2,
    }, // 1 = Coin 2 = Token
    contract_addresses: {
        type: Object,
    },
    category_row_id: {
        type: Number,
        index: true,
    }, //main category
    categories: {
        type: Object,
    },
    token_id: {
        type: String,
        unique: true,
        index: true,
    },
    token_name: {
        type: String,
        required: true,
    },
    symbol: {
        type: String,
        required: true,
    },
    token_image: {
        type: String,
    },
    active_status: {
        type: Number,
        required: true,
        default: 1,
    }, // 0 = disabled, 1 = enabled
    disable_type: {
        type: Number,
    },
    disable_reason: {
        type: String,
    },
    disable_subadmin_id: {
        type: Number,
    },
    disable_on: {
        type: Date,
    },
    price: {
        type: Number,
    },
    price_history_7d: {
        type: Number,
    },
    percent_change_1h: {
        type: Number,
        index: true,
    },
    percent_change_24h: {
        type: Number,
        index: true,
    },
    percent_change_90d: {
        type: Number,
        index: true,
    },
    percent_change_30d: {
        type: Number,
        index: true,
    },
    percent_change_60d: {
        type: Number,
        index: true,
    },
    percent_change_7d: {
        type: Number,
        index: true,
    },
    marketcap: {
        type: Number,
        default: 0,
        index: true,
    },
    total_supply: {
        type: Number,
        default: 0,
    },
    max_supply_type: {
        type: Number,
        default: 0,
    }, //max_supply_type:1 -> Infinity
    max_supply: {
        type: Number,
        default: 0,
    },
    circulating_supply: {
        type: Number,
        default: 0,
    },
    volume: {
        type: Number,
    },
    volume_7d: {
        type: Number,
    },
    volume_30d: {
        type: Number,
    },
    coinmarketcap_id: {
        type: Number,
    },
    high_24h: {
        type: Number,
    },
    low_24h: {
        type: Number,
    },
    updated_on: {
        type: Date,
    },
    price_updated_date_n_time: {
        type: Date,
    },
    updated_date_n_time: {
        type: Date,
    },
    created_on: {
        type: Date,
    },
    created_date_n_time: {
        type: Date,
    },
    view_counts: {
        type: Number,
    },
    cmc_rank: {
        type: Number,
    },
    cp_rank: {
        type: Number,
    },
    trending_number: {
        type: Number,
    },
    fetch_data_type: {
        type: Number,
    }, //2:bitquery
    coin_display_type: {
        type: Number,
    }, //new coin:1, stable coins:2, trending coin:3
    liquidity_data_status: {
        type: Number,
    },
    user_row_id: {
        type: Number,
    },
    liquidity: {
        type: Number,
    },
    liquidity_updated_on: {
        type: Date,
    },
    liquidity_updated_status: {
        type: Number,
        default: 0,
    }, // 0:not updated, 1: update_liquidity, 2:not fetched
    subadmin_row_id: {
        type: Number,
    },
    approval_status: {
        type: Number,
        default: 0,
    }, // 0:pending, 1:approved, 2:rejected
    rejected_reason: {
        type: String,
    },
    rejected_on: {
        type: Date,
    },
    fully_diluted_market_cap: {
        type: Number,
    },
    exchange_row_id_for_liveprice: {
        type: Number,
    },
    self_reported_circulating_supply: {
        type: String,
    },
    self_reported_market_cap: {
        type: String,
    },
    infinite_supply: {
        type: Boolean,
    },
    // twitter: {
    //     type: [String],
    //     default: []
    // },
    communities: {
        type: Object,
    },
    token_source_from: {
        type: String,
        default: "cmc",
    },
    general_info_score: {
        type: Number,
        default: 0
    },
    distribution_score: {
        type: Number,
        default: 0
    },
    resources_score: {
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
    company_row_id: {
        type: Number
    },
    ath_price: {
        type: Number
    },
    ath_price_date: {
        type: Date
    },
    atl_price: {
        type: Number
    },
    atl_price_date: {
        type: Date
    },
    token_start_price: {
        type: Number
    },
    token_start_date: {
        type: Date
    },
    token_title: {
        type: String
    },
    tradingview_id: {
        type: String
    },
    api_binance_id: {
        type: String
    },
    website_link: {
        type: String
    },
    whitepaper: {
        type: String
    },
    exchanges: {
        type: Object
    },
    explorers: {
        type: Object
    },
    communities: {
        type: Object
    },
    source_code_link: {
        type: String
    },
    liquidity_row_id: {
        type: Number
    }, // default active liquidity pool address
    first_trade_price: {
        type: Number
    },
    first_trade_on: {
        type: Date
    },
    notice: {
        type: String
    },
    description: {
        type: String
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


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await marketDbIncrement('cln_markets_tokens')
        this._id = value
    }
    next()
})



module.exports = marketDB.model('cln_markets_tokens', saveSchema)