const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    image_name: {
        type: String,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_user_default_profile_images')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_static_user_default_profile_images', saveSchema) 