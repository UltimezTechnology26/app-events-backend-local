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
    date_n_time: {
        type: Date
    }
})
saveSchema.index({ _id: 1, position_name: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_manual_user_positions')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_manual_user_positions', saveSchema)
