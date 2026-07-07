const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    link_name: {
        type: String,
        required: true
    },
    link_url: {
        type: String,
        required: true
    }
})




saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_social_links_types')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_static_social_links_types', saveSchema) 