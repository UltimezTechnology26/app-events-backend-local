const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    investor_type: {
        type: Number,
        index: true
    }, //1:user, 2:company
    investor_registered_type: {
        type: Number,
        index: true
    }, //1:registered, 2:manual
    investor_row_id: {
        type: Number,
        index: true
    },// _id of users or companies
    funds_raised_registered_type: {
        type: Number,
        index: true
    },// 1:registered, 2:manual
    funds_raised_company_row_id: {
        type: Number,
        index: true
    },
    category_row_id: {
        type: Number
    }, //funding rounds — index defined once below via schema.index(), not here too
    investor_category_row_id: {
        type: Number,
        index: true
    }, //1:user, 2:company
    announcement_date: {
        type: Date
    },
    amount: {
        type: Number
    },
    round_id: {
        type: Number,
        index: true
    }, // funding round id which stores multiple investments
    verified_status: {
        type: Number,
        default: 0
    }, // 0:Pending, 1:Approved
    verified_on: {
        type: Date
    },
    reject_type: {
        type: Number
    },
    reject_reason: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.index({ verified_status: 1, investor_type: 1, investor_registered_type: 1, investor_row_id: 1 });
saveSchema.index({ announcement_date: 1 });
saveSchema.index({ amount: 1 });

// Critical indexes for getUserListDetails performance
saveSchema.index({ investor_type: 1, investor_registered_type: 1, investor_row_id: 1 });
saveSchema.index({ investor_type: 1, investor_registered_type: 1, investor_row_id: 1, verified_status: 1 });

// Additional indexes for companyList function optimization
saveSchema.index({ investor_type: 1, investor_registered_type: 1, verified_status: 1 });
saveSchema.index({ funds_raised_company_row_id: 1, funds_raised_registered_type: 1, verified_status: 1 });
saveSchema.index({ investor_row_id: 1, investor_type: 1, investor_registered_type: 1, verified_status: 1 });
saveSchema.index({ category_row_id: 1 });

saveSchema.index({ funds_raised_company_row_id: 1, verified_status: 1 });
saveSchema.index({ investor_type: 1, investor_registered_type: 1, funds_raised_company_row_id: 1, verified_status: 1 });

// Added for the funding module refactor — verified these 3 don't already exist above:
saveSchema.index({ funds_raised_company_row_id: 1, announcement_date: -1 }); // funds_raised_list / company_funding_details date sort within a company
saveSchema.index({ investor_row_id: 1, announcement_date: -1 }); // investment_graph / investor overview date sort within an investor
saveSchema.index({ round_id: 1, verified_status: 1 }); // verifyRound / rejectRound / createOrUpdateRound pending-round lookups

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_funding_investment_lists')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_funding_investment_lists', saveSchema)