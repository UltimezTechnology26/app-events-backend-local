const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    company_row_id: {
        type: Number,
        required: true,
        index: true
    },
    user_row_id: {
        type: Number,
        index: true
    },
    // email_send_status: {
    //     type: Boolean,
    //     // default: false
    // },
    last_email_sent_on: { type: Date },

    date_n_time: {
        type: Date
    }
})

// Additional indexes for companyList function optimization
saveSchema.index({ user_row_id: 1, company_row_id: 1 });
saveSchema.index({ company_row_id: 1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_watchlists')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_company_watchlists', saveSchema)