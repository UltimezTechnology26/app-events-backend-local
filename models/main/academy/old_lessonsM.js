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
    chapter_row_id: {
        type: Number,
        index: true
    },
    lesson_number: {
        type: Number,
        index: true,
        required: true
    },
    lesson_id: {
        type: Number,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    author_name: {
        type: String
    },
    updated_on: {
        type: Date
    },
    lesson_image_url: {
        type: String
    },
    lesson_url: {
        type: String,
        index: true,
    },
    lesson_status: {
        type: Number,
        default: 1
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_courses_lessons_olds')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_academy_courses_lessons_olds', saveSchema)