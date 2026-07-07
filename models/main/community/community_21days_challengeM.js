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
    group_ids: {
        type: [Number],
        required: true,
        trim: true
    },
    valid_status: {
        type: Boolean,
        default: false
    },
    released_status: {
        type: Boolean,
        default: false
    },
    date_n_time: {
        type: Date,
        required: true
    }
}, { versionKey: false });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_community_21days_challenges');
        this._id = value;
    }
    next();
});

module.exports = mongoose.model('cln_community_21days_challenges', saveSchema);
