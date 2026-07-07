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
    lesson_started_row_id: {
        type: Number,
        index: true
    },
    lesson_row_id: {
        type: Number,
        required: true,
        index: true
    },
    question_row_id: {
        type: Number,
        required: true,
        index: true
    },
    answer_number: {
        type: Number,
        default: 0
    },
    answer_status: {
        type: Boolean,
        default: false
    },
    duration: {
        type: Number,
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

saveSchema.index({ user_row_id: 1, lesson_row_id: 1, answer_status: 1 });
saveSchema.index({ user_row_id: 1, lesson_row_id: 1 });
saveSchema.index({ user_row_id: 1, lesson_row_id: 1, close_status: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_quiz_answers')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_academy_quiz_answers', saveSchema)