const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    email_type: {
        type: Number
    }, //1:course welcome email
    sent_status: {
        type: Boolean,
        default: false
    }, // false:pending, true:completed
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_remainder_emails')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_academy_remainder_emails', saveSchema)