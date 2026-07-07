const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    email_id: {
        type: String
    },
    feedback_type: {
        type: Number,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    date_n_time: {
        type: Date,
        required: true
    },
    website_rating: {
        type: Number,
        required: true
    },
    speed_rating: {
        type: Number,
        required: true
    }
})

// saveSchema.index({ user_row_id:1 })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_feedbacks')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_feedbacks', saveSchema)

