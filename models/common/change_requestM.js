const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const COUNTER_NAME = 'cln_change_requests'

const actorRefSchema = mongoose.Schema({
    type: {
        type: String,
        enum: ['admin', 'subadmin', 'user', 'system'],
        default: null
    },
    id: {
        type: Number,
        default: null
    }
}, { _id: false })

const changeSchema = mongoose.Schema({
    field: {
        type: String,
        required: true
    },
    // Human-readable name for `field` (e.g. "Name" for `user_row_id`) - see SectionConfig.fieldLabels.
    field_label: {
        type: String,
        default: null
    },
    old_value: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    old_label: {
        type: String,
        default: null
    },
    new_value: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    new_label: {
        type: String,
        default: null
    },
    // Per-field authorship: who last touched this field, when a pending request has been
    // amended by more than one submitter (see change-request.service.ts's mergeFieldChanges).
    changed_by: {
        type: actorRefSchema,
        default: null
    }
}, { _id: false })

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    module: {
        type: String,
        required: true
    },
    // NOT `collection` — Mongoose-reserved document path.
    target_collection: {
        type: String,
        required: true
    },
    target_row_id: {
        type: Number,
        default: null
    }, // null = create request
    root_document_id: {
        type: Number,
        required: true
    },
    section: {
        type: String,
        default: 'default'
    },
    scope: {
        type: String,
        enum: ['document', 'child'],
        default: 'document'
    },
    action: {
        type: String,
        enum: ['create', 'update', 'delete'],
        required: true
    },

    // The field-set to apply on publish.
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    // The reviewer-facing diff. Holds old AND new so the review screen needs no join.
    changes: {
        type: [changeSchema],
        default: []
    },
    // Full row, for a pending delete — the only place to see what would be removed once the
    // live row is gone. Unused by document-scope sections (SEO, Social Media).
    row_snapshot: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    revision: {
        type: Number,
        default: 1
    }, // bumped when a pending request is amended
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled', 'published'],
        default: 'pending'
    },

    requested_by: {
        type: actorRefSchema,
        default: () => ({})
    },
    requested_at: {
        type: Date,
        default: Date.now
    },

    reviewed_by: {
        type: actorRefSchema,
        default: null
    },
    reviewed_at: {
        type: Date,
        default: null
    },
    reason: {
        type: String,
        default: null
    }, // required on reject
    rating: {
        type: Number,
        default: null
    }, // 1-10, required on approve
    note: {
        type: String,
        default: null
    }, // required on approve

    apply_started_at: {
        type: Date,
        default: null
    }, // second layer beneath the transaction; detects an abandoned apply
    applied_at: {
        type: Date,
        default: null
    }
}, { versionKey: false })

// No unique index: `target_row_id` is null for create requests and MongoDB treats null as a
// value, so a unique (module, target_row_id, section) partial index rejects a second pending
// create. Accepted as out of scope — one company has one assigned sub-admin (design §13.1 item 4).
saveSchema.index({ module: 1, root_document_id: 1, section: 1, status: 1 })
saveSchema.index({ module: 1, root_document_id: 1, status: 1 })
saveSchema.index({ status: 1, requested_at: -1 })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID(COUNTER_NAME)
        this._id = value
    }
    next()
})

module.exports = mongoose.model(COUNTER_NAME, saveSchema)
