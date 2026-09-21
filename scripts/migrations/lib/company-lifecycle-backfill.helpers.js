const entity_lifecycleM = require('../../../models/common/entity_lifecycleM')
const change_logM = require('../../../models/common/change_logM')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

const MODULE_NAME = 'company'
const TARGET_COLLECTION = 'cln_company_lists'
const LIFECYCLE_COUNTER = 'cln_entity_lifecycle'
const SECTION = 'lifecycle'
const BACKFILL_NOTE = 'Backfilled from legacy fields; original actor not recorded'
const SYSTEM_ACTOR = { type: 'system', id: null }

/**
 * A row id of 0 is not a real actor: approval_sub_admin_row_id is only populated when
 * admin_manager_type === 2, and defaults to 0 otherwise. Anything unusable becomes
 * 'system' rather than a guess.
 */
const toActor = (type, id) => {
    if (type && id !== null && id !== undefined && Number.isFinite(Number(id)) && Number(id) !== 0) {
        return { type, id: Number(id) }
    }
    return SYSTEM_ACTOR
}

/** Upsert one lifecycle stamp. `_id` via $setOnInsert — pre('save') does not run on upsert. */
async function writeStamp(documentId, field, stamp) {
    const nextId = await getCollectionID(LIFECYCLE_COUNTER)
    await entity_lifecycleM.updateOne(
        { module: MODULE_NAME, document_id: documentId },
        { $set: { [field]: stamp }, $setOnInsert: { _id: nextId } },
        { upsert: true }
    )
}

/** Insert a historical log entry only if this company+action has not been backfilled. */
async function writeLogOnce(documentId, action, actor, reason, at) {
    const already = await change_logM.exists({
        module: MODULE_NAME,
        root_document_id: documentId,
        action,
        section: SECTION
    })
    if (already) {
        return false
    }

    await change_logM.create({
        module: MODULE_NAME,
        target_collection: TARGET_COLLECTION,
        target_row_id: documentId,
        root_document_id: documentId,
        section: SECTION,
        action,
        actor,
        changes: [],
        reason,
        created_at: at || new Date()
    })
    return true
}

module.exports = { toActor, writeStamp, writeLogOnce, SYSTEM_ACTOR, BACKFILL_NOTE }
