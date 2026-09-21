import logger from '../../../config/logger'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import { insertChangeLog } from '../../common/status-audit/status-audit.queries'
import { approveChangeRequestFields as approveFieldsInStore, findRequestById, markApproved } from './change-request.queries'
import { ApplyChangeRequestResult, CHANGE_REQUEST_STATUS } from './change-request.types'
import { SECTION_REGISTRY, isKnownSection, SectionConfig } from './change-request.registry'

const LOG_ACTION_APPROVE = 'approve'
const RATING_MIN = 1
const RATING_MAX = 10
const ACTION_UPDATE = 'update'

export const NOT_FOUND_MESSAGE = 'Sorry, Invalid change request id'
export const NOT_PENDING_MESSAGE = 'Sorry, This change request is no longer pending'
export const INVALID_RATING_MESSAGE = 'Sorry, Rating must be a whole number from 1 to 10'
export const NOTE_REQUIRED_MESSAGE = 'The Note field is required'
const APPROVED_MESSAGE = 'Change request approved'

/**
 * Approve does NOT apply the change — it only records the reviewer's decision (rating + note)
 * and moves the request from PENDING to APPROVED. Publishing (making it live) is a separate,
 * later action — see change-request.apply.ts, now gated on APPROVED rather than PENDING.
 */
export async function approveChangeRequest({
  changeRequestId,
  actor,
  rating,
  note,
}: {
  changeRequestId: number
  actor: ActorRef
  rating: number
  note: string
}): Promise<ApplyChangeRequestResult> {
  if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    return { status: false, message: { alert_message: INVALID_RATING_MESSAGE } }
  }
  if (note.trim() === '') {
    return { status: false, message: { alert_message: NOTE_REQUIRED_MESSAGE } }
  }

  const request = await findRequestById(changeRequestId)
  if (!request) {
    return { status: false, message: { alert_message: NOT_FOUND_MESSAGE } }
  }
  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    return { status: false, message: { alert_message: NOT_PENDING_MESSAGE } }
  }

  await markApproved({ id: changeRequestId, actor, rating, note })

  // CONFIRMED BUG FIX: a whole-request Approve used to only flip the request's own top-level
  // `status` to APPROVED. For a section with `fieldLevelApproval: true` (Basic Details/SEO/Social
  // Media), change-request.apply.ts's publish gate checks `changes[].status === 'approved'`
  // instead of the whole-request status the moment ANY change entry carries a per-field status at
  // all (which computeDiff now stamps 'pending' on every field unconditionally) — so a whole-
  // request Approve on an UPDATE to one of these sections left every field still 'pending' and
  // publish always failed afterward with a silent "not approved" (no error logged, since
  // applyChangeRequest's early-return isn't a thrown exception). Reproduced live: approving a
  // Professional Basic Details edit via this exact function, then publishing, returned
  // `publishedCount: 0` with nothing in the error log to explain why. Fixed by also approving
  // every field the request touches whenever the section actually uses field-level approval on an
  // update — this makes a plain "Approve" behave as "approve everything", matching what an admin
  // clicking a single Approve button on the whole request would reasonably expect; per-field
  // approval (approveChangeRequestFields above) remains available for a genuine partial approval.
  if (isKnownSection(request.section) && request.action === ACTION_UPDATE) {
    const config: SectionConfig = SECTION_REGISTRY[request.section]
    if (config.fieldLevelApproval && (request.changes ?? []).length > 0) {
      await approveFieldsInStore({
        id: changeRequestId,
        fieldKeys: request.changes.map((c) => c.field),
        actor,
        rating,
        note,
      })
    }
  }

  try {
    await insertChangeLog({
      module: request.module,
      target_collection: request.target_collection,
      target_row_id: request.target_row_id ?? request.root_document_id,
      root_document_id: request.root_document_id,
      section: request.section,
      action: LOG_ACTION_APPROVE,
      actor,
      changes: request.changes,
      reason: note,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, changeRequestId }, 'change-request: approve log write failed')
  }

  return { status: true, message: { alert_message: APPROVED_MESSAGE } }
}

const FIELDS_APPROVED_MESSAGE = 'Selected fields approved'

/**
 * Field-level approval (Basic Details/SEO/Social Media UPDATE requests only - see
 * FieldChange.status's doc comment). A groupKey in fieldKeys (e.g. 'location') expands to every
 * member field name via the section's own fieldGroups config, so the caller never has to know
 * which literal fields a group covers. Doesn't touch the request's own top-level `status` -
 * unlike a whole-request approve, this can run any number of times as more fields get resolved;
 * change-request.apply.ts (publish) and the queue queries read changes[]/derived_status instead.
 */
export async function approveChangeRequestFields({
  changeRequestId,
  fieldKeys,
  actor,
  rating,
  note,
}: {
  changeRequestId: number
  fieldKeys: string[]
  actor: ActorRef
  rating: number
  note?: string
}): Promise<ApplyChangeRequestResult> {
  if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    return { status: false, message: { alert_message: INVALID_RATING_MESSAGE } }
  }

  const request = await findRequestById(changeRequestId)
  if (!request) {
    return { status: false, message: { alert_message: NOT_FOUND_MESSAGE } }
  }

  let groups: Record<string, string[]> = {}
  if (isKnownSection(request.section)) {
    const config: SectionConfig = SECTION_REGISTRY[request.section]
    groups = config.fieldGroups ?? {}
  }
  const expanded = new Set<string>()
  for (const key of fieldKeys) {
    const members: string[] | undefined = groups[key]
    if (members) members.forEach((m: string) => expanded.add(m))
    else expanded.add(key)
  }

  await approveFieldsInStore({ id: changeRequestId, fieldKeys: Array.from(expanded), actor, rating, note })

  try {
    await insertChangeLog({
      module: request.module,
      target_collection: request.target_collection,
      target_row_id: request.target_row_id ?? request.root_document_id,
      root_document_id: request.root_document_id,
      section: request.section,
      action: LOG_ACTION_APPROVE,
      actor,
      changes: request.changes.filter((c) => expanded.has(c.field)),
      reason: note ?? null,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, changeRequestId }, 'change-request: approve-fields log write failed')
  }

  return { status: true, message: { alert_message: FIELDS_APPROVED_MESSAGE } }
}
