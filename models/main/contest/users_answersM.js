const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number
    },
    contest_started_row_id: {
        type: Number
    },
    contest_row_id: {
        type: Number,
        required: true
    },
    question_row_id: {
        type: Number,
        required: true
    },
    time_duration: {
        type: Number,
        default: 0
    },
    answer_number: {
        type: Number,
        default: 0
    },
    answer_status: {
        type: Boolean,
        default: false
    },
    close_status: {
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
        const value = await getCollectionID('cln_main_weekly_contests_answers')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_main_weekly_contests_answers', saveSchema)