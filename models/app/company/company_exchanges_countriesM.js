const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },

    country_id: {
        type: Number
    },

}, { versionKey: false })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_exchanges_static_countries')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_exchanges_static_countries', saveSchema)