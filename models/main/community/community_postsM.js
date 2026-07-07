const mongoose = require('mongoose');
const { getCollectionID } = require('../../../utils/helpers/database_helper');

const communityPostSchema = new mongoose.Schema(
    {
        _id: {
            type: Number
        },
        content: {
            type: String,
            required: true,
            trim: true
        },
        user_row_id: {
            type: Number,
            required: true
        },
        company_row_id: {
            type: Number,
        },
        group_id: {
            type: Number,
            required: true
        },
        image: {
            type: String,
            default: ''
        },
        date: {
            type: Date,
            default: Date.now
        },
        repost_user_row_id: {
            type: Number,
            default: null
        },
        repost_company_row_id: {
            type: Number,
        },
        is_repost: {
            type: Boolean,
            default: false
        },
        repost_comment: {
            type: String,
            default: ""
        },
        post_status: {
            type: Boolean,
            default: true
        },
        repost_id: {
            type: Number
        },
        reposted_date: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

communityPostSchema.pre('save', async function (next) {
    if (!this._id) {
        let isUnique = false;
        while (!isUnique) {
            const randomId = Math.floor(100000000 + Math.random() * 900000000); // 9-digit random number
            const existing = await mongoose.models.cln_main_community_posts.findOne({ _id: randomId });
            if (!existing) {
                this._id = randomId;
                isUnique = true;
            }
        }
    }
    next();
});

communityPostSchema.index({ post_status: 1 });
communityPostSchema.index({ _id: 1, post_status: 1 });

communityPostSchema.index({ user_row_id: 1, post_status: 1, date: -1 });

communityPostSchema.index({ post_status: 1, group_id: 1, date: -1 });

communityPostSchema.index({ post_status: 1, repost_id: 1 });
communityPostSchema.index({ post_status: 1, repost_user_row_id: 1 });
communityPostSchema.index({ post_status: 1, user_row_id: 1, group_id: 1, date: -1 });

module.exports = mongoose.model('cln_main_community_posts', communityPostSchema);