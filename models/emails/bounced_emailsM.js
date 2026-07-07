const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    email_id: {
        type: String,
        unique: true,
        required: true
    },
    status: {
        type: String
        // required:true
    },
    reason: {
        type: String,
    },
    bounced_date: {
        type: Date,
    },
    sub_admin_row_id: {
        type: Number,
    },
    resolved_status: {
        type: Boolean,
        default: false
    },
    fixed_date_time: {
        type: Date,
    },
    resolved_reason: {
        type: String,
    },
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_bounced_emails')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_bounced_emails', saveSchema)