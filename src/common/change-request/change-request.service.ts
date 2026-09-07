import logger from '../../../config/logger'
import { ActorRef, FieldChange } from '../status-audit/status-audit.types'
import { insertChangeLog } from '../status-audit/status-audit.queries'
import { computeDiff, filterDisplayChanges } from './change-request.diff'
import { resolveActorName } from '../status-audit/status-audit.actor'
import { applyChangeRequest } from './change-request.apply'
import { COMPANY_SECTION_REGISTRY, isCompanySection, SectionConfig } from './change-request.registry'
import {
  amendPendingRequest,
  findApprovedRequestsForEntity,
  findPendingRequest,
  findPendingRequestsForEntity,
  findPendingRequestsPaginated,
  findRejectedRequestsPaginated,
  insertChangeRequest,
} from './change-request.queries'
import {
  CHANGE_REQUEST_ACTION,
  CHANGE_REQUEST_STATUS,
  ApprovedChangeSummary,
  ChangeRequestAction,
  PendingChangeSummary,
  RejectedChangeSummary,
  SubmitChangeRequestResult,
} from './change-request.types'

/** Attaches a resolved display name (see resolveActorName's own doc comment) - never mutates what's stored, only what a reviewer-facing summary returns. A request always has a submitter, so `requested_by` is never null here. */
async function withActorName(actor: ActorRef): Promise<ActorRef> {
  return { ...actor, name: await resolveActorName(actor) }
}

/** Same as withActorName, but for `reviewed_by` - null until a request is actually reviewed, so this passes null straight through instead of resolving anything. */
async function withReviewerName(actor: ActorRef | null): Promise<ActorRef | null> {
  if (!actor) return actor
  return withActorName(actor)
}

/**
 * Merges this submission's field diffs into the request's cumulative change set, keyed by
 * field. A field touched again gets its `changed_by` overwritten to the newer actor (and its
 * `new_value`/`new_label` refreshed); `old_value`/`old_label` are only ever taken from the
 * FIRST time a field was touched, since that's the true baseline against the live document —
 * re-diffing against `effective` on a later amend would otherwise reset it to the
 * previous-amendment's value instead. A field untouched by this submission keeps its prior
 * entry, authorship included — this is what makes "multiple contributors" detectable at all;
 * without the merge, only the latest amender's fields would ever be visible.
 */
function mergeFieldChanges(existingChanges: FieldChange[], newChanges: FieldChange[], actor: ActorRef): FieldChange[] {
  const byField = new Map(existingChanges.map((change) => [change.field, change]))
  for (const change of newChanges) {
    const prior = byField.get(change.field)
    byField.set(change.field, {
      field: change.field,
      old_value: prior ? prior.old_value : change.old_value,
      old_label: prior ? prior.old_label : change.old_label,
      new_value: change.new_value,
      new_label: change.new_label,
      changed_by: actor,
    })
  }
  return Array.from(byField.values())
}

const LOG_ACTION_SUBMIT = 'submit'
const LOG_ACTION_AMEND = 'amend_request'
const SCOPE_DOCUMENT = 'document'
const INVALID_SECTION_MESSAGE = 'Sorry, Invalid section'
const NO_CHANGES_MESSAGE = 'No changes to submit'
const SUBMITTED_MESSAGE = 'Changes submitted for approval'

export interface SubmitSectionChangeParams {
  module: string
  section: string
  rootDocumentId: number
  targetRowId: number | null
  /** Current live values for this section, as a PLAIN object (`.lean()`). */
  liveValues: Record<string, unknown>
  submitted: Record<string, unknown>
  actor: ActorRef
  /**
   * Defaults to UPDATE. Only Basic Details' company-creation path needs CREATE — every other
   * document-scope section (SEO, Social Media) only ever edits an already-existing company's
   * own sub-document, never creates the company itself, so this was never configurable before.
   */
  action?: ChangeRequestAction
}

/**
 * Stages one section's edit as a pending change request.
 *
 * The diff baseline is the EFFECTIVE state — live values overlaid with any pending request's
 * payload — not live. Diffing against live would make a second editor's save look like a revert
 * of the first editor's pending change and silently discard it (design §13.1 item 5).
 */
export async function submitChangeRequest({
  module,
  section,
  rootDocumentId,
  targetRowId,
  liveValues,
  submitted,
  actor,
  action = CHANGE_REQUEST_ACTION.UPDATE,
}: SubmitSectionChangeParams): Promise<SubmitChangeRequestResult> {
  if (!isCompanySection(section)) {
    logger.error({ module, section, rootDocumentId }, 'change-request: unknown section')
    return { status: false, message: { alert_message: INVALID_SECTION_MESSAGE } }
  }

  const config = COMPANY_SECTION_REGISTRY[section] as SectionConfig
  const existing = await findPendingRequest({ module, rootDocumentId, section })
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
  let storedChanges: FieldChange[]

  if (existing) {
    storedChanges = filterDisplayChanges(mergeFieldChanges(existing.changes, displayChanges, actor), config.displayFields)
    await amendPendingRequest({ id: existing._id, payload, changes: storedChanges, actor })
    changeRequestId = existing._id
    logAction = LOG_ACTION_AMEND
  } else {
    storedChanges = displayChanges.map((change) => ({ ...change, changed_by: actor }))
    changeRequestId = await insertChangeRequest({
      module,
      target_collection: config.collection,
      target_row_id: targetRowId,
      root_document_id: rootDocumentId,
      section,
      scope: SCOPE_DOCUMENT,
      action,
      payload,
      changes: storedChanges,
      requested_by: actor,
    })
    logAction = LOG_ACTION_SUBMIT
  }

  // Written on every submission, so an amend never erases who made the earlier edit — the
  // request row itself only carries the latest submitter.
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

  return {
    status: true,
    message: { alert_message: SUBMITTED_MESSAGE },
    changeRequestId,
    changeCount: storedChanges.length,
  }
}

export async function getPendingChangeRequests({
  module,
  rootDocumentId,
}: {
  module: string
  rootDocumentId: number
}): Promise<{ status: boolean; message: PendingChangeSummary[] }> {
  const pending = await findPendingRequestsForEntity({ module, rootDocumentId })

  const message: PendingChangeSummary[] = await Promise.all(pending.map(async (request) => ({
    change_request_id: request._id,
    section: request.section,
    status: CHANGE_REQUEST_STATUS.PENDING,
    revision: request.revision,
    requested_by: await withActorName(request.requested_by),
    requested_at: request.requested_at,
    changes: request.changes,
    action: request.action,
  })))

  return { status: true, message }
}

/**
 * Global cross-entity pending-request summaries for a module — every root document's pending
 * requests together, not just one. Entity display fields (name/logo) are NOT resolved here:
 * that's module-specific enrichment the caller owns (see company_admin.approvals.service.ts's
 * getGlobalPendingChangeRequests), so this stays reusable across every future module.
 */
export async function getPendingChangeRequestsAcrossEntities({
  module,
  skip,
  limit,
}: {
  module: string
  skip: number
  limit: number
}): Promise<{ status: boolean; message: (PendingChangeSummary & { root_document_id: number })[]; count: number }> {
  const { data, count } = await findPendingRequestsPaginated({ module, skip, limit })

  const message = await Promise.all(data.map(async (request) => ({
    change_request_id: request._id,
    section: request.section,
    status: CHANGE_REQUEST_STATUS.PENDING,
    revision: request.revision,
    requested_by: await withActorName(request.requested_by),
    requested_at: request.requested_at,
    changes: request.changes,
    action: request.action,
    root_document_id: request.root_document_id,
  })))

  return { status: true, message, count }
}

/**
 * Global cross-entity rejected-request summaries for a module — every root document's rejected
 * requests together, mirroring getPendingChangeRequestsAcrossEntities above (and markets' own
 * Pending/Rejected Changes tab pair). Same "entity enrichment is the caller's job" split.
 */
export async function getRejectedChangeRequestsAcrossEntities({
  module,
  skip,
  limit,
}: {
  module: string
  skip: number
  limit: number
}): Promise<{ status: boolean; message: (RejectedChangeSummary & { root_document_id: number })[]; count: number }> {
  const { data, count } = await findRejectedRequestsPaginated({ module, skip, limit })

  const message = await Promise.all(data.map(async (request) => ({
    change_request_id: request._id,
    section: request.section,
    status: CHANGE_REQUEST_STATUS.REJECTED,
    revision: request.revision,
    requested_by: await withActorName(request.requested_by),
    requested_at: request.requested_at,
    reviewed_by: await withReviewerName(request.reviewed_by),
    reviewed_at: request.reviewed_at,
    reason: request.reason,
    changes: request.changes,
    action: request.action,
    root_document_id: request.root_document_id,
  })))

  return { status: true, message, count }
}

const NOTHING_APPROVED_MESSAGE = 'Nothing approved to publish'
const ALL_PUBLISHED_MESSAGE = 'All approved changes published successfully'

export interface PublishAllChangeRequestsResult {
  status: boolean
  message: { alert_message: string }
  publishedCount: number
}

/**
 * Bulk-publishes every APPROVED (not yet live) request for one entity in a single action —
 * mirrors markets' root_document_id-scoped `publishChangeRequests`, which backs its own
 * "Publish (N)" button. Each request still goes through applyChangeRequest's own per-request
 * transaction (a live write to one section plus its own status update) — there is no single
 * cross-section transaction wrapping the whole batch, since the sections being published can
 * span entirely different collections with no shared invariant to protect atomically together.
 * A request that fails to apply is skipped (not retried) so one bad request can't block the rest
 * of an otherwise-healthy batch; the caller sees exactly how many actually went live.
 */
export async function publishAllChangeRequests({
  module,
  rootDocumentId,
  actor,
}: {
  module: string
  rootDocumentId: number
  actor: ActorRef
}): Promise<PublishAllChangeRequestsResult> {
  const approved = await findApprovedRequestsForEntity({ module, rootDocumentId })
  if (approved.length === 0) {
    return { status: true, message: { alert_message: NOTHING_APPROVED_MESSAGE }, publishedCount: 0 }
  }

  let publishedCount = 0
  for (const request of approved) {
    const result = await applyChangeRequest({ changeRequestId: request._id, actor })
    if (result.status) {
      publishedCount += 1
    } else {
      logger.error({ changeRequestId: request._id, rootDocumentId }, 'change-request: bulk publish skipped a request that failed to apply')
    }
  }

  return {
    status: publishedCount > 0,
    message: {
      alert_message: publishedCount === approved.length
        ? ALL_PUBLISHED_MESSAGE
        : `Published ${publishedCount} of ${approved.length} approved changes`,
    },
    publishedCount,
  }
}

export async function getApprovedChangeRequests({
  module,
  rootDocumentId,
}: {
  module: string
  rootDocumentId: number
}): Promise<{ status: boolean; message: ApprovedChangeSummary[] }> {
  const approved = await findApprovedRequestsForEntity({ module, rootDocumentId })

  const message: ApprovedChangeSummary[] = await Promise.all(approved.map(async (request) => ({
    change_request_id: request._id,
    section: request.section,
    status: CHANGE_REQUEST_STATUS.APPROVED,
    revision: request.revision,
    requested_by: await withActorName(request.requested_by),
    requested_at: request.requested_at,
    reviewed_by: await withReviewerName(request.reviewed_by),
    reviewed_at: request.reviewed_at,
    rating: request.rating,
    note: request.note,
    changes: request.changes,
    action: request.action,
  })))

  return { status: true, message }
}
