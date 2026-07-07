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
    profile_image_type: {
        type: Number
    }, //0:uploaded image, >0: default images
    profile_image: {
        type: String
    }
})

saveSchema.index({ user_row_id: 1 });
saveSchema.index({ user_row_id: 1, _id: 1 });
saveSchema.index({ user_row_id: 1, profile_image_type: 1 });
saveSchema.index({ user_row_id: 1, profile_image_type: 1, _id: 1 });

saveSchema.index({ user_row_id: 1, profile_image: 1 });
saveSchema.index({ user_row_id: 1, profile_image_type: 1, profile_image: 1 });
saveSchema.index({ user_row_id: 1, profile_image: 1, _id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_profile_images')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_profile_images', saveSchema)