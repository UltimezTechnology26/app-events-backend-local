const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    started_row_id: {
        type: Number,
        index: true
    },
    question_row_id: {
        type: Number,
        required: true,
        index: true
    },
    answer_number: {
        type: Number,
        default: 0
    },
    score: {
        type: Number,
        default: 0
    },
    date_n_time: {
        type: Date,
        required: true
    }
}, { versionKey: false })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_onboarding_answers')
        this._id = value
    }
    next()
})


module.exports = mongoose.model('cln_academy_onboarding_answers', saveSchema)