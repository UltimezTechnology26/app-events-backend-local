const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    award_title: {
        type: String
    },
    award_description: {
        type: String
    },
    award_image: {
        type: String
    }
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_awards')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_professionals_awards', saveSchema)