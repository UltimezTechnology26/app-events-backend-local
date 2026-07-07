const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    domain_name: {
        type: String,
        required: true
    }
})
saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_blocked_domains')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_blocked_domains', saveSchema)
