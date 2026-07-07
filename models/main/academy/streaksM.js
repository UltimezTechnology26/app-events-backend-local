const mongoose = require('mongoose');
const { getCollectionID } = require('../../../utils/helpers/database_helper');

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true,
        unique: true
    },
    streak_dates: {
        type: [String],
        default: []
    },
    updated_at: {
        type: String,
    },
    streak_completed_status: {
        type: Boolean,
        default: false
    }
}, { versionKey: false });

saveSchema.index({ user_row_id: 1 }, { unique: true });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_streaks');
        this._id = value;
    }
    next();
});

module.exports = mongoose.model('cln_academy_streaks', saveSchema);