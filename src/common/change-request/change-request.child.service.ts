import logger from '../../../config/logger'
import { ActorRef } from '../status-audit/status-audit.types'
import { insertChangeLog } from '../status-audit/status-audit.queries'
import { computeDiff, filterDisplayChanges, mergeFieldChanges } from './change-request.diff'
import { COMPANY_SECTION_REGISTRY, isCompanySection, SectionConfig } from './change-request.registry'
import { findPendingRequestForTargetRow } from './change-request.child.queries'
import { amendPendingRequest, insertChangeRequest } from './change-request.queries'
import { CHANGE_REQUEST_ACTION, SubmitChangeRequestResult } from './change-request.types'

const LOG_ACTION_SUBMIT = 'submit'
const LOG_ACTION_AMEND = 'amend_request'
const SCOPE_CHILD = 'child'
const INVALID_SECTION_MESSAGE = 'Sorry, Invalid section'
const NO_CHANGES_MESSAGE = 'No changes to submit'
const SUBMITTED_MESSAGE = 'Changes submitted for approval'
const DELETE_SUBMITTED_MESSAGE = 'Deletion submitted for approval'

export interface SubmitChildChangeParams {
  module: string
  section: string
  rootDocumentId: number
  /** null = create a new row; a real id = edit that existing row. */
  targetRowId: number | null
  /** {} for a create — there is nothing live yet. */
  liveValues: Record<string, unknown>
  submitted: Record<string, unknown>
  actor: ActorRef
}

/**
 * Stages one row's create or update as a pending change request.
 *
 * CREATE has no existing row to look up a pending request against — every submission simply
 * inserts another pending 'create' row, matching today's live behaviour of adding two rows if
 * "add" is clicked twice.
 *
 * UPDATE looks up the pending request scoped to this exact target_row_id (not just the section —
 * a list section can have several rows pending at once) and diffs against the EFFECTIVE state
 * (live overlaid with any pending payload), so a second editor's save chains onto the first
 * rather than reverting it (design §13.1 item 5, same reasoning as the document-scope path).
 */
export async function submitChildChangeRequest({
  module,
  section,
  rootDocumentId,
  targetRowId,
  liveValues,
  submitted,
  actor,
}: SubmitChildChangeParams): Promise<SubmitChangeRequestResult> {
  if (!isCompanySection(section)) {
    logger.error({ module, section, rootDocumentId }, 'change-request: unknown section')
    return { status: false, message: { alert_message: INVALID_SECTION_MESSAGE } }
  }

  const config = COMPANY_SECTION_REGISTRY[section] as SectionConfig
  const existing = targetRowId === null ? null : await findPendingRequestForTargetRow({ module, targetRowId, section })
  const effective = existing?.payload ? { ...liveValues, ...existing.payload } : liveValues

  const changes = await computeDiff({
    before: effective,
    submitted,
    schemaPaths: config.schemaPaths,
    editableFields: config.editableFields,
    labelResolvers: config.labelResolvers,
    fieldLabels: config.fieldLabels,
  })

  if (changes.length === 0) {
    return { status: true, message: { alert_message: NO_CHANGES_MESSAGE }, changeCount: 0 }
  }

  const payload: Record<string, unknown> = { ...(existing?.payload ?? {}) }
  for (const change of changes) {
    payload[change.field] = change.new_value
  }

  const displayChanges = filterDisplayChanges(changes, config.displayFields)

  let changeRequestId: number
  let logAction: string
  // Total fields on the request after this submission - the merged set on an amend (matches
  // submitChangeRequest's own storedChanges.length), just this submission's diff on a fresh one.
  let totalChangeCount: number

  if (existing) {
    // CONFIRMED BUG FIX: see mergeFieldChanges' own doc comment - without this, amending a row
    // that already had a field decided (approved/rejected) discarded that field's entry, and
    // every OTHER untouched field, from the request outright.
    const storedChanges = filterDisplayChanges(mergeFieldChanges(existing.changes, displayChanges, actor), config.displayFields)
    await amendPendingRequest({ id: existing._id, payload, changes: storedChanges, actor })
    changeRequestId = existing._id
    logAction = LOG_ACTION_AMEND
    totalChangeCount = storedChanges.length
  } else {
    changeRequestId = await insertChangeRequest({
      module,
      target_collection: config.collection,
      target_row_id: targetRowId,
      root_document_id: rootDocumentId,
      section,
      scope: SCOPE_CHILD,
      action: targetRowId === null ? CHANGE_REQUEST_ACTION.CREATE : CHANGE_REQUEST_ACTION.UPDATE,
      payload,
      changes: displayChanges,
      requested_by: actor,
    })
    logAction = LOG_ACTION_SUBMIT
    totalChangeCount = displayChanges.length
  }

  try {
    await insertChangeLog({
      module,
      target_collection: config.collection,
      target_row_id: targetRowId ?? rootDocumentId,
      root_document_id: rootDocumentId,
      section,
      action: logAction,
      actor,
      changes: displayChanges,
      reason: null,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, module, section, rootDocumentId, changeRequestId }, 'change-request: submit log write failed')
  }

  return { status: true, message: { alert_message: SUBMITTED_MESSAGE }, changeRequestId, changeCount: totalChangeCount }
}

export interface SubmitChildDeleteParams {
  module: string
  section: string
  rootDocumentId: number
  targetRowId: number
  rowSnapshot: Record<string, unknown>
  actor: ActorRef
}

/**
 * Stages a row's deletion as a pending change request. No field diff — row_snapshot carries the
 * full row for the reviewer, the same way cln_change_logs.snapshot works for a company delete
 * (audit-trail plan). payload stays empty; applySectionWrite's delete branch uses target_row_id,
 * not payload.
 */
export async function submitChildDeleteRequest({
  module,
  section,
  rootDocumentId,
  targetRowId,
  rowSnapshot,
  actor,
}: SubmitChildDeleteParams): Promise<SubmitChangeRequestResult> {
  if (!isCompanySection(section)) {
    logger.error({ module, section, rootDocumentId }, 'change-request: unknown section')
    return { status: false, message: { alert_message: INVALID_SECTION_MESSAGE } }
  }

  const config = COMPANY_SECTION_REGISTRY[section] as SectionConfig

  // CONFIRMED BUG FIX: a delete used to store an empty `changes` array, leaving reviewers with
  // no way to see what was actually being deleted (blank diff, confirmed report). Reusing
  // computeDiff against an EMPTY `before` and the full row_snapshot as `submitted` naturally
  // produces one "— → value" entry per editable field that's actually present on the snapshot -
  // same label resolvers as every other diff in this section (business names, country names,
  // skill names, etc.), for free.
  const changes = await computeDiff({
    before: {},
    submitted: rowSnapshot,
    schemaPaths: config.schemaPaths,
    editableFields: config.editableFields,
    labelResolvers: config.labelResolvers,
    fieldLabels: config.fieldLabels,
  })

  const displayChanges = filterDisplayChanges(changes, config.displayFields)

  const changeRequestId = await insertChangeRequest({
    module,
    target_collection: config.collection,
    target_row_id: targetRowId,
    root_document_id: rootDocumentId,
    section,
    scope: SCOPE_CHILD,
    action: CHANGE_REQUEST_ACTION.DELETE,
    payload: {},
    changes: displayChanges,
    requested_by: actor,
    row_snapshot: rowSnapshot,
  })

  try {
    await insertChangeLog({
      module,
      target_collection: config.collection,
      target_row_id: targetRowId,
      root_document_id: rootDocumentId,
      section,
      action: LOG_ACTION_SUBMIT,
      actor,
      changes: displayChanges,
      reason: null,
      snapshot: rowSnapshot,
    })
  } catch (err) {
    logger.error({ err, module, section, rootDocumentId, changeRequestId }, 'change-request: delete submit log write failed')
  }

  return { status: true, message: { alert_message: DELETE_SUBMITTED_MESSAGE }, changeRequestId, changeCount: 1 }
}
