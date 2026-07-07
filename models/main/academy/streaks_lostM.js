const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        unique: true,
        required: true
    },
    days: {
        type: Number
    },
    date_n_time: {
        type: Date,
        required: true
    }
}, { versionKey: false })


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_streaks_losts')
        this._id = value
    }
    next()
})



module.exports = mongoose.model('cln_academy_streaks_losts', saveSchema)