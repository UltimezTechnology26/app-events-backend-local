const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    skill_name: {
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

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_user_skills')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_static_user_skills', saveSchema)
