const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    sponsorship_name: {
        type: String
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_event_sponsor_categories')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_static_event_sponsor_categories', saveSchema)