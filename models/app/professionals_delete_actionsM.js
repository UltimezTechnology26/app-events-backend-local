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
    action_type: {
        type: Number,
        default: 1
    }, //1:account recovered, 2:account deleted
    action_reason: {
        type: String
    },
    full_name: {
        type: String
    },
    user_name: {
        type: String
    },
    email_id: {
        type: String
    },
    approval_status: {
        type: Number,
        default: 0
    }, //0:pending, 1:approved, 2:rejected
    date_n_time: {
        type: Date
    }
})

Schema.index({ user_name: 1, approval_status: 1 });
Schema.index({ user_name: 1 }); // Text search for deletion

Schema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_professionals_delete_actions')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_professionals_delete_actions', Schema)