
const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true,
        unique: true
    },
    // country_id:{
    //     type:Number
    // },
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
    }
})

saveSchema.index({ user_row_id: 1 });

saveSchema.index({ user_row_id: 1, latitude: 1, longitude: 1 });
saveSchema.index({ latitude: 1, longitude: 1 });
saveSchema.index({ user_row_id: 1, location: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_locations')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_professionals_locations', saveSchema)
