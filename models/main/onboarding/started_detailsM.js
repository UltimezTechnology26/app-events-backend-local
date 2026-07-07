const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true
    },
    course_row_id: {
        type: Number,

    },
    status: {
        type: Number,
        default: 0
    }, // 0: pending 1:completed
    score: {
        type: Number
    },
    path_type:
    {
        type: Number
    },
    recommended_course_row_id: {
        type: Number
    },
    date_n_time: {
        type: Date,
        required: true
    }
}, { versionKey: false })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_onboarding_started_details')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_academy_onboarding_started_details', saveSchema)
