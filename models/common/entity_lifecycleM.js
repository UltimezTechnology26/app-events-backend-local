const mongoose = require('mongoose')
const { getCollectionID } = require('../../utils/helpers/database_helper')

const COUNTER_NAME = 'cln_entity_lifecycle'

// Shared across every module (company / event / professional) rather than embedded on
// each entity document — see change-log-approval-workflow.md §13.1 item 1 and §13.10.
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

const stampSchema = mongoose.Schema({
    by: {
        type: actorRefSchema,
        default: () => ({})
    },
    at: {
        type: Date,
        default: null
    },
    reason: {
        type: String,
        default: null
    } // used by rejected / disabled / deleted
}, { _id: false })

const saveSchema = mongoose.Schema({
    _id: {
        type: Number
    },
    module: {
        type: String,
        required: true
    }, // 'company' | 'event' | 'professional'
    document_id: {
        type: Number,
        required: true
    }, // the entity's own _id

    last_updated: { type: stampSchema, default: () => ({}) },
    last_published: { type: stampSchema, default: () => ({}) },
    last_approved: { type: stampSchema, default: () => ({}) },
    last_rejected: { type: stampSchema, default: () => ({}) },
    last_enabled: { type: stampSchema, default: () => ({}) },
    last_disabled: { type: stampSchema, default: () => ({}) },
    last_deleted: { type: stampSchema, default: () => ({}) },
    last_restored: { type: stampSchema, default: () => ({}) },

    has_pending_changes: {
        type: Boolean,
        default: false
    } // maintained by the approval flow (plan 2), declared here so the shape is final
}, { versionKey: false })

// All three modules number their records independently from 1, so `document_id` alone
// is ambiguous — company 88, event 88 and professional 88 are unrelated records.
// Unique so an entity can never acquire two lifecycle rows (§13.10).
saveSchema.index({ module: 1, document_id: 1 }, { unique: true })
saveSchema.index({ module: 1, has_pending_changes: 1 })

saveSchema.pre('save', async function (next) {
    if (!this._id) {
        const value = await getCollectionID(COUNTER_NAME)
        this._id = value
    }
    next()
})

module.exports = mongoose.model(COUNTER_NAME, saveSchema)
