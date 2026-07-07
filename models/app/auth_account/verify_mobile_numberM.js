const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true
    },
    mobile_otp_number: {
        type: Number
    },
    mobile_verify_code: {
        type: String
    },
    mobile_verify_status: {
        type: Boolean,
        default: false
    }
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_auth_verify_mobile_numbers')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_auth_verify_mobile_numbers', saveSchema)