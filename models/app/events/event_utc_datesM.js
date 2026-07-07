const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    utc_time: {
        type: String
    },
    timezone: {
        type: String
    },
    country: {
        type: String
    },
    country_row_id: {
        type: Number
    }
})

saveSchema.index({ _id: 1, utc_time: 1 });
saveSchema.index({ _id: 1, timezone: 1 });
saveSchema.index({ _id: 1, country: 1 });
saveSchema.index({ _id: 1, timezone: 1, country: 1, utc_time: 1 });
saveSchema.index({ _id: 1, country_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_utc_dates')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_events_utc_dates', saveSchema)