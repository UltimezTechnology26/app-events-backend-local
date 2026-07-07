const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

//like_status 1:like, 2:dislike
const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_ip_address: {
        type: String,
        index: true,
        required: true
    },
    lesson_row_id: {
        type: Number,
        index: true,
        required: true
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_lesson_user_readers')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_academy_lesson_user_readers', saveSchema)