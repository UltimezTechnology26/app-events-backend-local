const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    designation_name: {
        type: String,
        required: true
    },
    show_in_job_status: {
        type: Number,
        default: 1
    }, //show in job:1, don't show in job:2
    active_status: {
        type: Boolean,
        default: true
    },
    date_n_time: {
        type: Date
    }
})
saveSchema.index({ _id: 1, active_status: 1 });
saveSchema.index({ active_status: 1, designation_name: 1 });
saveSchema.index({ designation_name: 1 });
saveSchema.index({ _id: 1, active_status: 1, designation_name: 1 });


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_user_designations')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_static_user_designations', saveSchema)