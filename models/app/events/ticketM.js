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
    title: {
        type: String
    },
    benefits: {
        type: Object
    },
    ticket_type: {
        type: Number,
        default: 2
    }, // 1: paid, 2: free
    price: {
        type: Number
    },
    sell_status: {
        type: Number,
        default: 0
    },// 1: Sold
    active_status: {
        type: Number,
        default: 1
    },//0: Disabled, 1: Enabled
    updated_date_n_time: {
        type: Date
    }
})

saveSchema.index({ event_row_id: 1, title: 1 })
saveSchema.index({ event_row_id: 1, active_status: 1 });
saveSchema.index({ event_row_id: 1, ticket_type: 1 });
saveSchema.index({ event_row_id: 1, price: 1 });
saveSchema.index({ event_row_id: 1, sell_status: 1 });
saveSchema.index({ active_status: 1, ticket_type: 1 });
saveSchema.index({ event_row_id: 1, active_status: 1, ticket_type: 1 });
saveSchema.index({ event_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_event_tickets')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_event_tickets', saveSchema)