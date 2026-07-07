const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number,
        required: true,
        index: true
    },
    facebook: {
        type: String
    },
    twitter: {
        type: String
    },
    linkedin: {
        type: String
    },
    instagram: {
        type: String
    },
    video_link: {
        type: String
    },
    telegram: {
        type: String
    },
    feed_url: {
        type: String
    },
    medium: {
        type: String
    },
    reddit: {
        type: String
    },
    other_social_links: {
        type: Object
    },
    youtube_channel: {
        type: String
    },
})
saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_social_links')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_social_links', saveSchema)