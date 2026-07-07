const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')


const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    admin_manager_type: {
        type: Number,
        required: true
    },
    admin_row_id: {
        type: Number,
        required: true
    },
    login_ip_address: {
        type: Object,
        required: true
    },
    date_n_time: {
        type: Date,
        required: true
    }
})


saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_admin_ip_addreses')
        this._id = value
    }
    next()
})
module.exports = mongoose.model('cln_admin_ip_addreses', saveSchema)