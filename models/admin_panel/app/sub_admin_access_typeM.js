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
    },
    // Presentation-only text for the "Manager Roles" admin reference page -
    // never read by any permission check. What an access type actually grants
    // is governed entirely by each route's own checkAdminLoginToken call.
    description: {
        type: String
    },
    responsibilities: {
        type: [String]
    },
    can_extra: {
        type: [String]
    },
    cant_extra: {
        type: [String]
    },
    // What a Restricted Access / Full Access sub-admin can do in this module.
    restricted_access: {
        type: [String]
    },
    full_access: {
        type: [String]
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