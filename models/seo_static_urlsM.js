const mongoose = require('mongoose');
const { getCollectionID } = require('../utils/helpers/database_helper');


const seoStaticURLSchema = mongoose.Schema({
    url: {
        type: String,
        required: true,
        trim: true,
        index: true, // fast search by URL
    },

    module: {
        type: String,
        required: true,
        trim: true,
        index: true, // helpful for filtering by module
    },

    h1_tag: {
        type: String,
        default: "",
    },

    header_structure: {
        type: [
            {
                tag: String,
                text: String
            }
        ],
        default: []
    },

    meta_title: {
        type: String,
        trim: true,
    },

    meta_keywords: {
        type: String, // comma separated or "keyword1,keyword2"
        trim: true,
    },

    meta_description: {
        type: String,
        trim: true,
    },

    robots_index: {
        type: String,
        enum: ["index", "noindex"],
        default: "index",
    },

    robots_follow: {
        type: String,
        enum: ["follow", "nofollow"],
        default: "follow",
    },

    og_title: {
        type: String,
        default: "",
    },

    og_description: {
        type: String,
        default: "",
    },

    og_image: {
        type: String, // URL to OG image
        default: "",
    },

    twitter_title: {
        type: String,
        default: "",
    },

    twitter_description: {
        type: String,
        default: "",
    },

    twitter_creator: {
        type: String, // ex: @username
        default: "",
    },
    page_type: {
        type: String,
        default: "",
    },
    schema_type: {
        type: String,
        default: "BreadCrumbList",
    },

    created_at: {
        type: Date,
        default: Date.now,
    },

    updated_at: {
        type: Date,
        default: Date.now,
    },
    private: {
        type: Boolean,
        default: false,
    }
}, { versionKey: false })
seoStaticURLSchema.index({ module: 1, url: 1 });
seoStaticURLSchema.index({ url: 1 });
seoStaticURLSchema.index({ updated_at: -1 });

seoStaticURLSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_seo_static_urls');
        this._id = value;
    }
    next();
});


module.exports = mongoose.model('cln_seo_static_urls', seoStaticURLSchema)