const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    category_name: {
        type: String
    },
    active_status: {
        type: Boolean,
        default: true
    },
    date_n_time: {
        type: Date
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_jobs_roles')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_jobs_roles', saveSchema)