const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        required: true,
        index: true
    },
    ip_address: {
        type: String,
        required: true
    },
    device_name: {
        type: String
    },
    domain_row_id: {
        type: Number,
        default: 1,
        index: true
    }, // 1.App 2.Markets 3.Events 4.Academy 5.Main
    page: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})


// saveSchema.index({ user_row_id:1, domain_row_id:1 })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_ip_addreses')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_ip_addreses', saveSchema)