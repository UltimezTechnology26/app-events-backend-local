const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    position_name: {
        type: String,
        required: true
    },
    active_status: {
        type: Boolean,
        default: true
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.index({ _id: 1, position_name: 1 });
saveSchema.index({ _id: 1, active_status: 1 });
saveSchema.index({ position_name: 1, active_status: 1 });
saveSchema.index({ _id: 1, active_status: 1, position_name: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_professionals_work_positions')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_static_professionals_work_positions', saveSchema)
