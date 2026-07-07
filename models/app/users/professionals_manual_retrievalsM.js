const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    gender: {
        type: Number,
        default: 0
    }, //1:male, 2:female, 3:others
    full_name: {
        type: String,
        index: true
    },
    email_id: {
        type: String,
        index: true
    },
    mobile_number: {
        type: String
    },
    profile_image: {
        type: String
    },
    // work_position:{
    //     type:String
    // },
    // company_type: {
    //     type:Number
    // },//1. registered  2. Manual
    // company_row_id: {
    //     type:Number
    // },
    user_link: {
        type: String
    },
    medium: {
        type: String
    },
    twitter: {
        type: String
    },
    reddit: {
        type: String
    },
    rss_feed: {
        type: String
    },
    created_on: {
        type: Date
    },
    updated_on: {
        type: Date
    },
    used_counts: {
        type: Number,
        default: 0,
        index: true
    },
    main_user_row_id: {
        type: Number,
        index: true
    },
    used_types: {
        type: Object
    },
    approval_status: {
        type: Number,
        default: 0
    },//0:pending, 1:approved, 2:rejected, 3:self registered
    approval_date: {
        type: Date
    },
    approval_sub_admin_row_id: {
        type: Number
    },
    reject_type: {
        type: Number
    },
    rejected_reason: {
        type: String
    }
},
    {
        versionKey: false
    })


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_manual_retrievals')
        this._id = value
    }
    next()
})

saveSchema.index({ full_name: 1, email_id: 1 });
saveSchema.index({ full_name: "text", email_id: "text" });

saveSchema.index({ _id: 1, full_name: 1, email_id: 1 });

module.exports = mongoose.model('cln_professionals_manual_retrievals', saveSchema)