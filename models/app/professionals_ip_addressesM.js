const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true,
        index: true
    },
    ip_address: {
        type: String,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_auth_ip_addresses')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_auth_ip_addresses', saveSchema)