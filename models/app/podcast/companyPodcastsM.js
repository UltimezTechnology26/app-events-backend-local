const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const Schema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number
    },
    channel_id: {
        type: String
    },
    channel_name: {
        type: String
    },
    channel_image: {
        type: String
    },
    publisher_name: {
        type: String
    },
    channel_description: {
        type: String
    },
    episodes: {
        type: Object
    },
    date_n_time: {
        type: Date
    }
})

Schema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_podcast_company_channels')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_podcast_company_channels', Schema)