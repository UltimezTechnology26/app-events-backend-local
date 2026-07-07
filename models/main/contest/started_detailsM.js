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
    contest_row_id: {
        type: Number,
        required: true
    },
    contest_status: {
        type: Number,
        default: 0
    }, // 0: pending 1:completed
    contest_score: {
        type: Number
    },
    time_duration: {
        type: Number,
        default: 0
    },
    ip_address: {
        type: String
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_main_weekly_contests_started_details')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_main_weekly_contests_started_details', saveSchema)

