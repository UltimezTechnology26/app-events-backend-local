const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    image_name: {
        type: String,
        required: true
    },
    image_type: {
        type: Number
    }
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_default_images')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_events_default_images', saveSchema)