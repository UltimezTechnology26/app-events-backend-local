const mongoose = require('mongoose');
const { getCollectionID } = require('../../../utils/helpers/database_helper');

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true,
        index: true
    },
    topic: {
        type: String,
        required: true,
        trim: true
    },
    document_link: {
        type: String,
        required: false,
        trim: true
    },
    article_content: {
        type: String,
        required: false
    },
    status: {
        type: String,
        enum: ['pending', 'published', 'unpublished'],
        default: 'pending'
    },
    unpublished_comment: {
        type: String,
        default: ''
    },
    date_n_time: {
        type: Date,
        required: true
    }
}, { versionKey: false });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_community_article_publish_requests');
        this._id = value;
    }
    next();
});

module.exports = mongoose.model('cln_community_article_publish_requests', saveSchema);
