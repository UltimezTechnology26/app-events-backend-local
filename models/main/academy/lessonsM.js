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
    lesson_number: {
        type: Number,
        index: true,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    author_name: {
        type: String,
        required: true
    },
    author_id: {
        type: Number,
        required: true
    },
    author_link: {
        type: String,
        required: true
    },
    reviewed_by_name: {
        type: String,
        required: true
    },
    reviewed_by_id: {
        type: Number,
        required: true
    },
    reviewed_by_link: {
        type: String,
        required: true
    },
    updated_on: {
        type: Date,
        required: true
    },
    lesson_image_url: {
        type: String,
        required: true
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
    },
    meta_keywords: {
        type: String,
        required: true
    },
    meta_description: {
        type: String,
        required: true
    },
})

saveSchema.index({ course_row_id: 1, lesson_number: 1 });
saveSchema.index({ course_row_id: 1, lesson_number: 1, _id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_courses_lessons')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_academy_courses_lessons', saveSchema)