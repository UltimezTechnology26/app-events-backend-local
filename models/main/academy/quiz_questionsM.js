const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    course_row_id: {
        type: Number,
        index: true,
        required: true
    },
    lesson_row_id: {
        type: Number,
        index: true,
        required: true
    },
    question_title: {
        type: String,
        required: true
    },
    option_a: {
        type: String
    },
    option_b: {
        type: String
    },
    option_c: {
        type: String
    },
    option_d: {
        type: String
    },
    correct_answer: {
        type: Number
    },
    time_in_seconds: {
        type: String
    },
    question_status: {
        type: Number
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.index({ lesson_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_quiz_questions')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_academy_quiz_questions', saveSchema)