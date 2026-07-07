const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    event_row_id: {
        type: Number,
        unique: true,
        required: true,
        index: true
    },

    meta_title: {
        type: String
    },
    meta_keywords: {
        type: String
    },
    meta_description: {
        type: String
    },
    robots_index: {
        type: String,
        enum: ["index", "noindex"],
        default: "index"
    },
    robots_follow: {
        type: String,
        enum: ["follow", "nofollow"],
        default: "follow"
    },
    og_title: {
        type: String,
        default: ""
    },
    og_description: {
        type: String,
        default: ""
    },
    twitter_title: {
        type: String,
        default: ""
    },
    twitter_description: {
        type: String,
        default: ""
    },
    twitter_creator: {
        type: String,  // Example: @username
        default: ""
    },
    header_structure: {
        type: [
            {
                tag: String,
                text: String
            }
        ],
        default: []
    }

})

// saveSchema.index({ user_row_id:1 })
saveSchema.index({ event_row_id: 1 });
saveSchema.index({ event_row_id: 1, _id: 1 });



saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_seo_details')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_events_seo_details', saveSchema)