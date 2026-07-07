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
    about_company: {
        type: String
    },
    // total_employees: {
    //     type:Number 
    // },//working employee range row id
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
saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_seo_details')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_seo_details', saveSchema)