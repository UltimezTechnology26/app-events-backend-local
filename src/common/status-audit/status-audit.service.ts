import logger from '../../../config/logger'
import {
  ACTION_TO_LIFECYCLE_FIELD,
  ACTION_TO_LOG_ACTION,
  AUDIT_MODULE_REGISTRY,
  DEFAULT_AUDIT_SECTION,
  isAuditModule,
} from './status-audit.registry'
import {
  countChangeLogsByEntity,
  findChangeLogsByEntity,
  findLifecycleByEntity,
  insertChangeLog,
  upsertLifecycleStamp,
} from './status-audit.queries'
import { ActorRef, EntityAuditHistoryParams, FieldChange, RecordStatusChangeParams } from './status-audit.types'
import { resolveActorName } from './status-audit.actor'

const INVALID_MODULE_MESSAGE = 'Sorry, Invalid module'

/** Convenience builder for the status transition a lifecycle action represents. */
export function buildStatusFieldChange(
  field: string,
  oldValue: number,
  newValue: number,
  oldLabel: string,
  newLabel: string,
): FieldChange {
  return { field, old_value: oldValue, old_label: oldLabel, new_value: newValue, new_label: newLabel }
}

/**
 * Records one lifecycle transition: appends to cln_change_logs (source of truth),
 * then upserts the matching stamp on cln_entity_lifecycle (rebuildable projection).
 *
 * Called AFTER the entity's status has already been written, so it deliberately does
 * NOT throw: the state change has succeeded, and failing the caller would misreport a
 * completed operation. Failures are awaited and logged with full context rather than
 * discarded — this is not fire-and-forget. Routing these writes through the `agenda`
 * queue for retry is future hardening.
 */
export async function recordStatusChange({
  module,
  documentId,
  action,
  actor,
  changes = [],
  reason = null,
  snapshot = null,
  section = DEFAULT_AUDIT_SECTION,
}: RecordStatusChangeParams): Promise<void> {
  if (!isAuditModule(module)) {
    logger.error({ module, documentId, action }, 'status-audit: unknown module, nothing recorded')
    return
  }

  const targetCollection = AUDIT_MODULE_REGISTRY[module].collection
  const at = new Date()

  try {
    await insertChangeLog({
      module,
      target_collection: targetCollection,
      target_row_id: documentId,
      root_document_id: documentId,
      section,
      action: ACTION_TO_LOG_ACTION[action],
      actor,
      changes,
      reason,
      snapshot,
    })
  } catch (err) {
    logger.error({ err, module, documentId, action }, 'status-audit: change log write failed')
    return
  }

  try {
    await upsertLifecycleStamp({
      module,
      documentId,
      lifecycleField: ACTION_TO_LIFECYCLE_FIELD[action],
      stamp: { by: actor, at, reason },
    })
  } catch (err) {
    logger.error({ err, module, documentId, action }, 'status-audit: lifecycle projection write failed')
  }
}

export async function getEntityAudit({
  module,
  documentId,
  skip,
  limit,
}: EntityAuditHistoryParams): Promise<{ status: boolean; message: unknown; count?: number }> {
  if (!isAuditModule(module)) {
    return { status: false, message: { alert_message: INVALID_MODULE_MESSAGE } }
  }

  const [lifecycle, history, count] = await Promise.all([
    findLifecycleByEntity(module, documentId),
    findChangeLogsByEntity({ module, documentId, skip, limit }),
    countChangeLogsByEntity(module, documentId),
  ])

  // CONFIRMED BUG FIX: Audit History showed the same raw "Admin #94 (Sub Admin)" id the
  // pending/approved/rejected lists used to show before resolveActorName existed - same fix,
  // applied here too. Never mutates the stored log entry, only what this read returns.
  const historyWithActorNames = await Promise.all(
    (history as { actor: ActorRef }[]).map(async (entry) => ({
      ...entry,
      actor: { ...entry.actor, name: await resolveActorName(entry.actor) },
    })),
  )

  return { status: true, message: { lifecycle, history: historyWithActorNames }, count }
}
