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
    coupon_code: {
        type: String
    },
    discount: {
        type: Number
    },
    updated_date_n_time: {
        type: Date
    }
})

saveSchema.index({ event_row_id: 1 })
saveSchema.index({ coupon_code: 1 });
saveSchema.index({ event_row_id: 1, coupon_code: 1 });
saveSchema.index({ discount: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_event_coupons')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_event_coupons', saveSchema)