const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    created_from_type: {
        type: Number,
        index: true
    }, // 1: Professional, 2:Events, 3: Funding
    company_name: {
        type: String,
        index: true
    },
    company_email_id: {
        type: String,
        index: true
    }, // unique
    company_logo: {
        type: String
    },
    website_link: {
        type: String
    }, // unique
    medium: {
        type: String
    },
    twitter: {
        type: String
    },
    reddit: {
        type: String
    },
    feed_url: {
        type: String
    },
    main_business_model_id: {
        type: Number,
        index: true
    },
    used_counts: {
        type: Number,
        index: true
    },
    used_types: {
        type: Object
    }, //1:funds , 2:user experience, 3:
    created_on: {
        type: Date
    },
    updated_on: {
        type: Date
    },
    approval_status: {
        type: Number,
        default: 0
    },//0:pending, 1:approved, 2:rejected
    approval_date: {
        type: Date
    },
    approval_sub_admin_row_id: {
        type: Number
    },
    main_company_row_id: {
        type: Number
    }, // cln_company_lists
    reject_type: {
        type: Number
    },
    reject_reason: {
        type: String
    }
},
    {
        versionKey: false
    })

saveSchema.index({ company_name: "text", company_id: "text" });

saveSchema.index({ _id: 1, company_name: 1 });
saveSchema.index({ company_name: 1 });
saveSchema.index({ _id: 1, company_name: 1, approval_status: 1 });
saveSchema.index({ main_business_model_id: 1, approval_status: 1 });
saveSchema.index({ company_name: 1, approval_status: 1 });

saveSchema.index({ _id: 1, company_name: 1, approval_status: 1, created_from_type: 1 });
saveSchema.index({ _id: 1, approval_status: 1, created_from_type: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_manual_retrievals')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_manual_retrievals', saveSchema)