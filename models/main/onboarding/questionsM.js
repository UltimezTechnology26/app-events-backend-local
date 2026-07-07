const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    category_row_id: {
        type: Number,
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
    a_points: {
        type: Number
    },
    b_points: {
        type: Number
    },
    c_points: {
        type: Number
    },
    d_points: {
        type: Number
    },
    question_status: {
        type: Number,
        default: 1
    },
    date_n_time: {
        type: Date,
        required: true
    }
}, { versionKey: false })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_onboarding_questions')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_academy_onboarding_questions', saveSchema)