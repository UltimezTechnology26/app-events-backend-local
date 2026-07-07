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
    basic_details: {
        type: Number,
        required: true
    },
    social_media: {
        type: Number,
        required: true
    },
    faq: {
        type: Number,
        required: true
    },
    awards: {
        type: Number,
        required: true
    },
    work_experience: {
        type: Number,
        required: true
    },
    investments: {
        type: Number,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professional_profile_score')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_professional_profile_score', saveSchema)