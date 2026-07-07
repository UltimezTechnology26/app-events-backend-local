const mongoose = require('mongoose');
const { getCollectionID } = require('../../../utils/helpers/database_helper');

const communityPostCommentSchema = new mongoose.Schema(
    {
        _id: Number,
        post_id: {
            type: Number,
            required: true,
            index: true
        },
        user_row_id: {
            type: Number,
            required: true,
            index: true
        },
        comment: {
            type: String,
            required: true,
            trim: true
        },

        parent_comment_id: {
            type: Number,
            default: null,
            index: true
        },
        date: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

// Auto-increment _id
communityPostCommentSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_main_community_post_comments');
        this._id = value;
    }
    next();
});

// Enforce one reply per user per comment
communityPostCommentSchema.index(
    { parentCommentId: 1, userId: 1 },
    {
        unique: true,
        partialFilterExpression: { parentCommentId: { $ne: null } }
    }
);

communityPostCommentSchema.index({ post_id: 1, parent_comment_id: 1 });
communityPostCommentSchema.index({ post_id: 1, parent_comment_id: null, date: -1 });
communityPostCommentSchema.index({ post_id: 1, user_row_id: 1 });
communityPostCommentSchema.index({ post_id: 1, user_row_id: 1, parent_comment_id: 1 });

module.exports = mongoose.model('cln_main_community_post_comments', communityPostCommentSchema);
