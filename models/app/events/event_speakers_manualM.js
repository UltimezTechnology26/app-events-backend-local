const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    event_row_id: {
        type: Number
    },
    gender: {
        type: Number
    },
    full_name: {
        type: String
    },
    email_id: {
        type: String
    },
    work_position: {
        type: String
    },
    company_name: {
        type: String
    },
    profile_image: {
        type: String
    },
    verify_string: {
        type: String
    },
    confirm_status: {
        type: Number,
        default: 0
    }// 0:pending, 1:confirmed
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_speakers_manuals')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_events_speakers_manuals', saveSchema)