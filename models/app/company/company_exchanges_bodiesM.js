const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    country_id: {
        type: Number,

    },
    regulatory_bodies_name: {
        type: String
    },
    regulatory_type_id: {
        type: Number
    },
    date_n_time: {
        type: Date,
        required: true
    }

}, { versionKey: false })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_exchange_bodies')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_exchange_bodies', saveSchema)
