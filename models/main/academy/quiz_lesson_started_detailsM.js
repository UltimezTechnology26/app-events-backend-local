const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true,
        required: true
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
    }, //coinpedia article row id
    lesson_status: {
        type: Number,
        default: 0
    }, // 0: pending 1: completed
    lesson_score: {
        type: Number
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.index({ user_row_id: 1, lesson_row_id: 1 });
saveSchema.index({ user_row_id: 1, course_row_id: 1, lesson_row_id: 1 });
saveSchema.index({ user_row_id: 1, course_row_id: 1, lesson_status: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_quiz_lession_started_details')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_academy_quiz_lession_started_details', saveSchema)

