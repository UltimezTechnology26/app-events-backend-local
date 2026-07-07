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
        required: true,
        index: true
    },
    view_status: {
        type: Number,
        default: 0
    }, //0:not seen, 1:seen
    date_n_time: {
        type: Date,
    }

})

saveSchema.index({ company_row_id: 1, user_row_id: 1 });
saveSchema.index({ user_row_id: 1, company_row_id: 1 });
saveSchema.index({ company_row_id: 1 });
saveSchema.index({ company_row_id: 1, user_row_id: 1, _id: 1 });

saveSchema.index({ company_row_id: 1, user_row_id: 1 }, { sparse: true });


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_followers')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_followers', saveSchema)