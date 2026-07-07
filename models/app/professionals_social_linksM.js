const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        unique: true,
        required: true,
        index: true
    },
    website: {
        type: String
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
    medium: {
        type: String
    },
    reddit: {
        type: String
    },
    feed_url: {
        type: String
    },
    other_social_links: {
        type: Object
    },
    youtube_channel: {
        type: String
    },

})


// saveSchema.index({ user_row_id:1 })
saveSchema.index({ user_row_id: 1 });
saveSchema.index({ user_row_id: 1, _id: 1 });



saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_social_links')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_social_links', saveSchema)