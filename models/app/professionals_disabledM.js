const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const Schema = mongoose.Schema({
    _id: {
        type: Number
    },
    user_row_id: {
        type: Number,
        index: true
    },
    disabled_reason: {
        type: String
    },
    date_n_time: {
        type: Date
    }
})

Schema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_disables')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_disables', Schema)