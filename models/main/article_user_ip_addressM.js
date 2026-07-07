const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    ip_address: {
        type: String,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_article_links_user_ip_addresses')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_article_links_user_ip_addresses', saveSchema)