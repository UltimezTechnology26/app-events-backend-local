const mongoose = require('mongoose');
const { getCollectionID } = require('../utils/helpers/database_helper');


const seoChangeLogSchema = mongoose.Schema({
    module_key: { type: String, required: true },       // e.g. "event"
    module_id: { type: String, required: true }, // event _id

    old_meta_title: { type: String, default: "" },
    new_meta_title: { type: String, default: "" },

    old_meta_description: { type: String, default: "" },
    new_meta_description: { type: String, default: "" },

    old_meta_keywords: { type: String, default: "" },
    new_meta_keywords: { type: String, default: "" },

    old_og_title: { type: String, default: "" },
    new_og_title: { type: String, default: "" },

    old_og_description: { type: String, default: "" },
    new_og_description: { type: String, default: "" },

    old_twitter_title: { type: String, default: "" },
    new_twitter_title: { type: String, default: "" },

    old_twitter_description: { type: String, default: "" },
    new_twitter_description: { type: String, default: "" },

    old_robots_index: { type: String, default: "" },
    new_robots_index: { type: String, default: "" },

    old_robots_follow: { type: String, default: "" },
    new_robots_follow: { type: String, default: "" },

    old_twitter_creator: { type: String, default: "" },
    new_twitter_creator: { type: String, default: "" },

    user_type: { type: String, required: true },

    updated_by: { type: String, ref: "users" },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false })

seoChangeLogSchema.index({ module_key: 1, updated_at: -1 });


seoChangeLogSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_seo_change_logs');
        this._id = value;
    }
    next();
});


module.exports = mongoose.model('cln_seo_change_logs', seoChangeLogSchema)