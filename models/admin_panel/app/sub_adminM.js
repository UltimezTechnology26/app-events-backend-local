const mongoose = require('mongoose')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const Schema = mongoose.Schema({
    _id: {
        type: Number
    },
    // user_name: {
    //     type:String
    // },
    full_name: {
        type: String
    },
    email_id: {
        type: String,
        unique: true,
    },
    mobile_number: {
        type: String
    },
    password: {
        type: String
    },
    login_status: {
        type: Number,
        default: 1
    }, //0:disabled, 1:enabled, 2:deleted
    create_type_row_id: {
        type: Object
    },
    date_n_time: {
        type: Date
    },
    sub_admin_type: {
        type: Number,
        default: 1
    }, //1: Marketing, 2:Developer
    // create_type_name: {
    //     type:String,
    //     required:true
    // },
    // type_status: {
    //     type:Number,
    //     required:true
    // },
    disabled_reason: {
        type: String
    },
    disabled_date_n_time: {
        type: Date
    }
})

Schema.index({ _id: 1, full_name: 1 });
Schema.index({ _id: 1, email_id: 1 });
Schema.index({ _id: 1, login_status: 1 });

Schema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID('cln_sub_admins')
        this._id = value
    }
    next()
})

module.exports = mongoose.model('cln_sub_admins', Schema)