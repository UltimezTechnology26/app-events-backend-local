const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    event_row_id: {
        type: Number,
        unique: true,
        index: true
    },
    link_user_register_status: {
        type: Boolean,
        default: true
    },
    link_attendee_list_status: {
        type: Boolean,
        default: true
    },
    link_speaker_status: {
        type: Boolean,
        default: true
    },
    link_partner_status: {
        type: Boolean,
        default: true
    },
    link_sponsor_status: {
        type: Boolean,
        default: true
    },
    link_ticket_status: {
        type: Boolean,
        default: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_events_link_display_details')
        this._id = value
    }
    next()
})
saveSchema.index({ event_row_id: 1 });

module.exports = mongoose.model('cln_events_link_display_details', saveSchema)