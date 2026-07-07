const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const Schema = mongoose.Schema({
    _id: {
        type: Number
    },
    full_name: {
        type: String
    },
    email_id: {
        type: String,
        // unique: true,
    },
    date_n_time: {
        type: Date
    },
    type: {
        type: Number,
        // required:true
    }//1. events 2. app 3. both
})

Schema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_sub_admin_emails')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_sub_admin_emails', Schema)