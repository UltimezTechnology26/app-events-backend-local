const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

//like_status 1:like, 2:dislike
const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true,
        required: true
    },
    post_id: {
        type: Number,
        index: true,
        required: true
    },
    like_status: {
        type: Number,
        required: true
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_main_community_user_likes')
        this._id = value
    }
    next()
})

saveSchema.index({ post_id: 1, like_status: 1 });
saveSchema.index({ post_id: 1, user_row_id: 1, like_status: 1 });
saveSchema.index({ user_row_id: 1, post_id: 1, like_status: 1, date_n_time: -1 });

module.exports = mongoose.model('cln_main_community_user_likes', saveSchema)