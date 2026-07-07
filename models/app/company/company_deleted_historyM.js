const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number
    },
    user_row_id: {
        type: Number,
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
        index: true
    },
    company_email_id: {
        type: String,
        index: true
    },
    company_logo: {
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
    country_id: {
        type: Number,
        index: true
    },
    company_location: {
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
    approval_status: {
        type: Number,
        default: 0
    }, //0:pending, 1:approved, 2:rejected
    date_n_time: {
        type: Date
    }
})

saveSchema.index({ company_id: 1, approval_status: 1 });
saveSchema.index({ company_row_id: 1 });


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_deleted_history_lists')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_deleted_history_lists', saveSchema)
