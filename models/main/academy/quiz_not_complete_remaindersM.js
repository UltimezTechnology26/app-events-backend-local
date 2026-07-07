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
    course_row_id: {
        type: Number,
        index: true
    },
    lesson_row_id: {
        type: Number,
        index: true
    },
    email_sent_status: {
        type: Boolean,
        default: false
    },
    date_n_time: {
        type: Date,
        required: true
    }
})


saveSchema.index({ user_row_id: 1, course_row_id: 1, lesson_row_id: 1 });
saveSchema.index({ user_row_id: 1, email_sent_status: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_academy_not_complete_remainder_emails')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_academy_not_complete_remainder_emails', saveSchema)