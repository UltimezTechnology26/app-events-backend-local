const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true
    },
    telegram_id: {
        type: String,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_auth_telegram_accounts')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_auth_telegram_accounts', saveSchema)