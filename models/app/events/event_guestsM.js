const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    event_row_id: {
        type: Number,
        index: true
    },
    user_type: {
        type: Number,
        default: 1,
        index: true
    }, //1:cln_professionals, 2:manual_retrievals 
    user_row_id: {
        type: Number,
        index: true
    },
    invitation_request_status: {
        type: Number,
        default: 0
    }, //0:invitation pending, 1:Accepted, 2:rejected
    invitation_type: {
        type: Number,
        default: 1
    }, //1. Manually registered  2. Added by host
    created_date_n_time: {
        type: Date
    },
    verify_string: {
        type: String
    },// not using 
    guest_user_type: {
        type: Number,
        default: 1
    }, //1:from cln_events_guests_emails , 2:from cln_professionals _id - not using
    guest_user_row_id: {
        type: Number
    },// not using
    guest_email_row_id: {
        type: Number
    }, // not using
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_guests')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_events_guests', saveSchema)