const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number,
        index: true
    },
    admin_sub_admin_type: {
        type: Number,
        required: true,
        index: true
    }, //1:admin, 2:sub admin
    sub_admin_row_id: {
        type: Number
    },
    claim_email_id: {
        type: String
    },
    claim_status: {
        type: Number
    }, //1:pending, 2:account claimed
    claim_verify_code: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_created_by_admins')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_created_by_admins', saveSchema)