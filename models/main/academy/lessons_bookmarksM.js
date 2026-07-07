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
    lesson_id: {
        type: Number,
        index: true,
        required: true
    }, // wordpress article id
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_courses_lessons_bookmarks')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_academy_courses_lessons_bookmarks', saveSchema)