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
    date_n_time: {
        type: Date,
        required: true
    }
})

// company_row_id already has field-level `index: true` above — the standalone
// `saveSchema.index({company_row_id:1})` that used to be here was an exact duplicate
// (Part 2 §2.7).
saveSchema.index({ company_row_id: 1, _id: 1 });
saveSchema.index({ company_row_id: 1, date_n_time: -1 });

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_added_to_partners')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_added_to_partners', saveSchema)