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
    chapter_number: {
        type: Number,
        index: true,
        required: true
    },
    title: {
        type: String
    },
    description: {
        type: String
    },
    chapter_status: {
        type: Boolean,
        default: true
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_courses_chapters')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_academy_courses_chapters', saveSchema)