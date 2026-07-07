const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    token_row_id: {
        type: Number
    },
    network_name: {
        type: String
    },
    network_link: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_static_cryto_networks')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_static_cryto_networks', saveSchema)