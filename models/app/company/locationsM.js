const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number
    },
    country_id: {
        type: Number
    },
    location: {
        type: String
    },
    area: {
        type: String
    },
    city: {
        type: String
    },
    country_name: {
        type: String
    },
    state: {
        type: String
    },
    longitude: {
        type: String
    },
    latitude: {
        type: String
    },
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_locations')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_company_locations', saveSchema)