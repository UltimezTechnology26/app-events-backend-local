const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')


const Schema = mongoose.Schema({
    _id: {
        type: Number
    },
    full_name: {
        type: String,
        required: true
    },
    email_id: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    date_n_time: {
        type: Date,
        required: true
    }
})

Schema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_admins')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_admins', Schema)