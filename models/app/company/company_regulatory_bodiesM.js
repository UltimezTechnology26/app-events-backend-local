const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    country_id: {
        type: Number,

    },

    regulatory_bodies: [
        {
            _id: {
                type: Number
            },
            regulatory_bodies_name: {
                type: String
            },

        }
    ]

}, { versionKey: false })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_exchanges_regulatory_bodies')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_exchanges_regulatory_bodies', saveSchema)
