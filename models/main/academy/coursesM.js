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
    course_description: {
        type: String,
        required: true
    },
    course_slug: {
        type: String,
        required: false
    },
    course_image: {
        type: String,
        required: true
    },
    expert_tag: {
        type: String,
        required: true
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
}, { versionKey: false })

saveSchema.index({ date_n_time: -1 });
saveSchema.index({ course_name: 1 });



saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_courses')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_academy_courses', saveSchema)