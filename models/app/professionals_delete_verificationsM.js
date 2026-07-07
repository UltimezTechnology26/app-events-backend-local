const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true,
        index: true
    },
    status: {
        type: Number,
        required: true
    },
    otp_number: {
        type: Number,
        required: true
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_delete_verifications')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_delete_verifications', saveSchema)