const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

//like_status 1:like, 2:dislike
//article_row_id = article_linksM _id
const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true,
        required: true
    },
    article_row_id: {
        type: Number,
        index: true,
        required: true
    },
    like_status: {
        type: Number,
        required: true
    },
    dislike_title: {
        type: String
    },
    dislike_comments: {
        type: String
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_article_links_user_likes')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_article_links_user_likes', saveSchema)