const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    sortname: {
        type: String,
        required: true
    },
    country_code: {
        type: String,
        required: true
    },
    country_name: {
        type: String,
        required: true
    },
    country_flag: {
        type: String,
        required: true
    },
    currency_code: {
        type: String
    },
    country_ticker: {
        type: String
    },
    currency_value: {
        type: Number,
        default: 0
    }
})

saveSchema.index({ _id: 1, active_status: 1 });

// Existing indexes
saveSchema.index({ _id: 1, country_name: 1, country_flag: 1 });
saveSchema.index({ _id: 1, country_code: 1 });
saveSchema.index({ _id: 1, sortname: 1 });
saveSchema.index({ country_name: 1, country_flag: 1, country_code: 1 });
saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_countries')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_static_countries', saveSchema)