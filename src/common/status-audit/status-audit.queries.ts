import { ActorRef, FieldChange, LifecycleStamp } from './status-audit.types'
import { LIFECYCLE_COUNTER_NAME } from './status-audit.registry'

const change_logM = require('../../../models/common/change_logM')
const entity_lifecycleM = require('../../../models/common/entity_lifecycleM')
const { getCollectionID } = require('../../../utils/helpers/database_helper')

export interface ChangeLogInput {
  module: string
  target_collection: string
  target_row_id: number
  root_document_id: number
  section: string
  action: string
  actor: ActorRef
  changes: FieldChange[]
  reason: string | null
  snapshot: unknown
}

// Explicit projections — CLAUDE.md forbids `SELECT *`. Listed once as constants so a
// new schema field is not silently pulled into every response.
const LIFECYCLE_PROJECTION = {
  _id: 0,
  module: 1,
  document_id: 1,
  last_updated: 1,
  last_published: 1,
  last_approved: 1,
  last_rejected: 1,
  last_enabled: 1,
  last_disabled: 1,
  last_deleted: 1,
  last_restored: 1,
  has_pending_changes: 1,
} as const

const CHANGE_LOG_PROJECTION = {
  _id: 1,
  action: 1,
  section: 1,
  actor: 1,
  changes: 1,
  reason: 1,
  created_at: 1,
} as const

/** Append-only. This is the source of truth, so it is written before the projection. */
export async function insertChangeLog(doc: ChangeLogInput): Promise<void> {
  await change_logM.create(doc)
}

export interface UpsertLifecycleStampParams {
  module: string
  documentId: number
  lifecycleField: string
  stamp: LifecycleStamp
}

/**
 * Upserts one lifecycle stamp field for an entity.
 *
 * `_id` is supplied through $setOnInsert because Mongoose's pre('save') hook does not
 * run on an upsert — without it Mongoose would generate an ObjectId and break the
 * Number typing this repo uses everywhere. `module`/`document_id` are deliberately
 * NOT in $setOnInsert: they are equality terms in the filter, and MongoDB rejects a
 * field that appears in both ("would create a conflict"). The filter's equality
 * values are applied to the inserted document automatically.
 *
 * The id fetched on an update-path call is simply unused; counter values are not
 * required to be contiguous, and this keeps the write a single atomic round trip
 * with no duplicate-key race to handle.
 */
export async function upsertLifecycleStamp({
  module,
  documentId,
  lifecycleField,
  stamp,
}: UpsertLifecycleStampParams): Promise<void> {
  const nextId = await getCollectionID(LIFECYCLE_COUNTER_NAME)

  await entity_lifecycleM.updateOne(
    { module, document_id: documentId },
    {
      $set: { [lifecycleField]: stamp },
      $setOnInsert: { _id: nextId },
    },
    { upsert: true },
  )
}

/** Served by the unique { module, document_id } index. */
export async function findLifecycleByEntity(module: string, documentId: number): Promise<unknown> {
  return entity_lifecycleM.findOne({ module, document_id: documentId }, LIFECYCLE_PROJECTION).lean()
}

export interface FindChangeLogsParams {
  module: string
  documentId: number
  skip: number
  limit: number
}

/** Served by the { root_document_id, created_at: -1 } index. Always paginated. */
export async function findChangeLogsByEntity({
  module,
  documentId,
  skip,
  limit,
}: FindChangeLogsParams): Promise<unknown[]> {
  return change_logM
    .find({ module, root_document_id: documentId }, CHANGE_LOG_PROJECTION)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
}

export async function countChangeLogsByEntity(module: string, documentId: number): Promise<number> {
  return change_logM.countDocuments({ module, root_document_id: documentId })
}
