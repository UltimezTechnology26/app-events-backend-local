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
    category_row_id: {
        type: Number
    },
    sponsor_partner_type: {
        type: Number,
        index: true
    }, // 1. Sponsor  2. Partner
    account_type: {
        type: Number,
        index: true
    }, // 1. User  2. Company
    registered_type: {
        type: Number,
        index: true
    }, // 1. Registerd  2. Manual
    user_company_row_id: {
        type: Number,
        index: true
    }, // user or company registered or manaul row id
    sponsorship_type_title: {
        type: String
    }, // category name
    manual_type: {
        type: String
    },// not used - need to shift live data
    type_row_id: {
        type: Number
    }, // not used - not storing sponsor and partner row id
    sponsor_partner_row_id: {
        type: Number
    }, // not used - user or company registered or manaul row id
    requested_status: {
        type: Number,
        default: 3
        //0:pending 1:approved ,2:rejected
    },
    sponsors_ids: {
        type: Object
    },
    created_date_n_time: {
        type: Date
    }
})

saveSchema.index({ account_type: 1, registered_type: 1, sponsor_partner_type: 1, user_company_row_id: 1 });

// Additional indexes for companyList function optimization
saveSchema.index({ user_company_row_id: 1, sponsor_partner_type: 1, account_type: 1, registered_type: 1 });
saveSchema.index({ event_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_event_sponsor_partner_details')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_event_sponsor_partner_details', saveSchema)