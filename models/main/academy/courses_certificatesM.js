const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number,
        default: () => Math.floor(Math.random() * 1_000_000_000),
        unique: true
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
    percentage_score: {
        type: Number
    },
    download_status: {
        type: Number,
        default: 0
    }, // 0:pending, 1:downloaded
    date_n_time: {
        type: Date,
        required: true
    },
    certificate_public: {
        type: Boolean,
        default: true
    },
    score_public: {
        type: Boolean,
        default: false
    },
    certificate_pdf_url: {
        type: String
    },
    certificate_image_url: {
        type: String
    }
}, { versionKey: false })

saveSchema.index({ user_row_id: 1, course_row_id: 1 }, { unique: true })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_courses_certificates')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_academy_courses_certificates', saveSchema)