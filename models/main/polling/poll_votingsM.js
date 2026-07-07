const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_type: {
        type: Number
    },//1.ip_address2.login address
    user_row_id: {
        type: Number
    },
    article_id: {
        type: Number
    },
    ip_address: {
        type: String
    },
    user_vote_type: {
        type: Number
    },//1.yes 2.no
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_article_polling_votes')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_article_polling_votes', saveSchema)
