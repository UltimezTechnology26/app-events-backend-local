const mongoose = require('mongoose');


const pageHistorySchema = mongoose.Schema({
    url: {
        type: String,
        required: true
    },
    duration_in_seconds: {
        type: Number
    },
    entered_at: {
        type: Date
    },
    left_at: {
        type: Date
    }
}, { versionKey: false })

const userPageTrackSchema = mongoose.Schema({
    user_row_id: { type: Number, required: true },
    page_history: [pageHistorySchema],
    updated_at: { type: String, required: true }
}, { versionKey: false })


userPageTrackSchema.index({ user_row_id: 1, updated_at: 1 }, { unique: true });

userPageTrackSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_page_tracks');
        this._id = value;
    }
    next();
});


module.exports = mongoose.model('cln_academy_page_tracks', userPageTrackSchema)