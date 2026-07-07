const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    create_type_name: {
        type: String,
        required: true
    },
    type_status: {
        type: Number,
        required: true
    }
})

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_sub_admin_access_type')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_sub_admin_access_type', saveSchema)