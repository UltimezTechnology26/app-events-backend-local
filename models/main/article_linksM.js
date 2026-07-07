const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

//like_status 1:like, 2:dislike
const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    article_id: {
        type: Number,
        index: true,
        required: true
    },
    article_url: {
        type: String,
        index: true,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_article_links')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_article_links', saveSchema)