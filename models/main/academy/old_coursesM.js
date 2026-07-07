const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    course_name: {
        type: String,
        required: true
    },
    course_url: {
        type: String,
        index: true,
        required: true
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_courses_olds')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_academy_courses_olds', saveSchema)