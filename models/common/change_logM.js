const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const COUNTER_NAME = 'cln_change_logs'

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

// Generic by design: a new field on any module's schema needs no change here.
// `old_label`/`new_label` carry resolved display text for foreign-key fields, so a
// reader sees "Country: India -> Singapore" rather than "country_id: 45 -> 91".
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
    // NOT `collection` — that is a Mongoose-reserved document path
    // (mongoose/lib/schema.js: `reserved.collection = 1`) and shadows
    // Document.prototype.collection.
    target_collection: {
        type: String,
        required: true
    },
    target_row_id: {
        type: Number,
        required: true
    },
    // The owning entity, even when target_row_id is a child row — without this,
    // "everything that happened to company 88" is unanswerable in one query.
    root_document_id: {
        type: Number,
        required: true
    },
    section: {
        type: String,
        default: 'default'
    },
    action: {
        type: String,
        enum: [
            'create', 'update', 'delete',
            'submit', 'amend_request', 'approve', 'reject',
            'publish', 'unpublish', 'enable', 'disable',
            'soft_delete', 'restore'
        ],
        required: true
    },
    actor: {
        type: actorRefSchema,
        required: true
    },
    changes: {
        type: [changeSchema],
        default: []
    },
    reason: {
        type: String,
        default: null
    },
    // Required on delete (the only surviving record of the row); optional elsewhere.
    snapshot: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    change_request_id: {
        type: Number,
        default: null
    },
    submit_batch_id: {
        type: Number,
        default: null
    },
    publish_batch_id: {
        type: Number,
        default: null
    },
    created_at: {
        type: Date,
        default: Date.now
    }
}, { versionKey: false })

saveSchema.index({ module: 1, target_row_id: 1, created_at: -1 })
saveSchema.index({ root_document_id: 1, created_at: -1 })
saveSchema.index({ 'actor.id': 1, created_at: -1 })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID(COUNTER_NAME)
        this._id = value
    }
    next()
})

module.exports = mongoose.model(COUNTER_NAME, saveSchema)
