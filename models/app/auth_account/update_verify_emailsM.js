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
    email_verify_type: {
        type: Number,
        default: 1
    }, //0:change email id, 1:otp verified, 2:update email id
    email_verify_code: {
        type: String
    },
    otp_number: {
        type: String
    },
    email_id: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_update_verify_emails')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_professionals_update_verify_emails', saveSchema)