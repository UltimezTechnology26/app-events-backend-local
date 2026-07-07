const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    follower_user_row_id: {
        type: Number,
        required: true,
        index: true
    }, //user_row_id
    following_user_row_id: {
        type: Number,
        required: true,
        index: true
    },
    view_status: {
        type: Number,
        default: 0
    }, //0:not seen, 1:seen
    confirm_request_status: {
        type: Number,
        default: 2,
        index: true
    },//0:not following, 1:pending, 2:approved
    date_n_time: {
        type: Date,
    }
})
saveSchema.index({ following_user_row_id: 1, confirm_request_status: 1 });
saveSchema.index({ follower_user_row_id: 1, confirm_request_status: 1 });
saveSchema.index({ following_user_row_id: 1, follower_user_row_id: 1, confirm_request_status: 1 });
saveSchema.index({ follower_user_row_id: 1, confirm_request_status: 2 });
saveSchema.index({ follower_user_row_id: 1, confirm_request_status: 2, _id: -1 });

saveSchema.index({ following_user_row_id: 1 });
saveSchema.index({ follower_user_row_id: 1, following_user_row_id: 1 });
saveSchema.index({ following_user_row_id: 1, confirm_request_status: 2, follower_user_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_followers')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_followers', saveSchema)