const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    regulator_type_name: {
        type: String,

    },
    company_row_id: {
        type: Number,

    },
    date_n_time: {
        type: Date,

    }
}, { versionKey: false })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_company_regulatory_types')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_company_regulatory_types', saveSchema)
