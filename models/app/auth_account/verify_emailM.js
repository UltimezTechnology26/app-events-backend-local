const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true,
        index: true
    },
    email_verify_status: {
        type: Boolean,
        default: false
    },
    email_verify_code: {
        type: String
    },
    email_otp_number: {
        type: String
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_auth_verify_emails')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_auth_verify_emails', saveSchema)