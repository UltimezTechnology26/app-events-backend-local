const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true,
        required: true
    },
    points: {
        type: String,
        required: true
    },
    point_type: {
        type: String,
        required: true // e.g., 'streaks', 'pro_batch', 'job_apply_eligibility', 'Course-...', 'news_coverage', 'team_interviewed'
    },
    point_status: {
        type: String,
        enum: ['credited', 'debited'],
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_points_lists')
        this._id = value
    }
    next()
})
saveSchema.index({ createdAt: -1 });
saveSchema.index({ point_type: 1 });
saveSchema.index({ point_status: 1 });
saveSchema.index({ user_row_id: 1, point_type: 1 });
saveSchema.index({ user_row_id: 1, point_type: 1, point_status: 1 });
module.exports = mongoose.model('cln_professionals_points_lists', saveSchema)