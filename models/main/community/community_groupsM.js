const mongoose = require('mongoose');
const { getCollectionID } = require('../../../utils/helpers/database_helper');

const communityGroupSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    hashtag: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    icon: {
        type: String
    },
    date: {
        type: Date,
        default: Date.now
    }
});

communityGroupSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_main_community_groups');
        this._id = value;
    }
    next();
});

communityGroupSchema.index({ _id: 1, name: 1 });
communityGroupSchema.index({ _id: 1, hashtag: 1 });

module.exports = mongoose.model('cln_main_community_groups', communityGroupSchema);