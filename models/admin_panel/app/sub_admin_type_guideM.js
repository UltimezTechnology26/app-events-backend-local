const mongoose = require('mongoose')

// Overall "what does this sub-admin type mean" text for the Manager Roles /
// Manage Sub Admin pages - one document per sub_admin_type (_id 1 = Restricted
// Access, 3 = Full Access). Written by the refresh button, which summarises the
// per-module restricted_access / full_access text on cln_sub_admin_access_type.
// Presentation only - never read by any permission check.
const Schema = mongoose.Schema({
    _id: {
        type: Number
    },
    summary: {
        type: String
    },
    tagline: {
        type: String
    },
    best_for: {
        type: String
    },
    can: {
        type: [String]
    },
    cannot: {
        type: [String]
    },
    updated_date_n_time: {
        type: Date
    }
})

module.exports = mongoose.model('cln_sub_admin_type_guide', Schema, 'cln_sub_admin_type_guide')
