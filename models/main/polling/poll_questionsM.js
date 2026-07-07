const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    article_id: {
        type: Number,
        required: true
    },
    article_title: {
        type: String
    },
    article_slug: {
        type: String
    },
    question_title: {
        type: String
    },
    date_n_time: {
        type: Date
    },
    question_status: {
        type: Number,
        default: 1
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_article_polling_questions')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_article_polling_questions', saveSchema)