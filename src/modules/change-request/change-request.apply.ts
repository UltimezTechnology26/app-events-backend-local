import mongoose from 'mongoose'
import logger from '../../../config/logger'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import { insertChangeLog } from '../../common/status-audit/status-audit.queries'
import { SECTION_REGISTRY, SECTION_BASIC_DETAILS, SECTION_PROFESSIONAL_BASIC_DETAILS, SECTION_FUNDING_ROUND, SECTION_ACQUISITIONS, SECTION_PROFESSIONAL_STATUS, SECTION_COMPANY_STATUS, SECTION_EVENT_STATUS, SectionConfig, isKnownSection } from './change-request.registry'
import { findRequestById, markApplied, markApplyStarted, markChangeRequestFieldsPublished } from './change-request.queries'
import { ApplyChangeRequestResult, ChangeRequestDoc, CHANGE_REQUEST_STATUS } from './change-request.types'
import { applySectionWrite, SECTION_MODELS } from './change-request.apply.writers'
import { applyBasicDetailsSideEffects } from '../../modules/company/settings/company.settings.service'
import { applyProfessionalBasicDetailsSideEffects } from '../../modules/professionals/professionals.self-service.service'
import { applyFundingRoundWrite } from '../../modules/funding/funding.service'
import { applyAcquisitionWrite } from '../../modules/company_acquisitions/company_acquisitions.service'
import { applyProfessionalStatusWrite, applyProfessionalStatusSideEffects } from '../../modules/professionals/professionals.lifecycle-apply'
import { applyCompanyStatusWrite, applyCompanyStatusSideEffects } from '../../modules/company_admin/company_admin.lifecycle-apply'
import { applyEventStatusWrite, applyEventStatusSideEffects } from '../../modules/events/events.lifecycle-apply'
import { recalculateProfileScoreAfterChange } from './change-request.profile-score'

/**
 * Dispatches to the section-specific writer for every section that declared
 * `customWriter: true` in the registry — sections whose live-data shape can't go through the
 * generic single-row applySectionWrite at all (see each section's own registry doc comment).
 */
async function applyCustomSectionWrite({
  request,
  session,
}: {
  request: ChangeRequestDoc
  session: unknown
}): Promise<{ appliedFieldCount: number }> {
  switch (request.section) {
    case SECTION_FUNDING_ROUND:
      return applyFundingRoundWrite({ request, session })
    case SECTION_ACQUISITIONS:
      return applyAcquisitionWrite({ request, session })
    case SECTION_PROFESSIONAL_STATUS:
      return applyProfessionalStatusWrite({ request, session })
    case SECTION_COMPANY_STATUS:
      return applyCompanyStatusWrite({ request, session })
    case SECTION_EVENT_STATUS:
      return applyEventStatusWrite({ request, session })
    default:
      throw new Error(`change-request: no custom writer registered for section '${request.section}'`)
  }
}

const companyM = require('../../../models/app/company/companyM')
const professionalsM = require('../../../models/app/professionalsM')

/** Owning root document per module — the company or professional the just-published section belongs to, stamped with the publishing actor's tracker fields below regardless of which section changed within that module. */
const ROOT_MODELS: Record<string, { updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>, options: Record<string, unknown>) => Promise<unknown> }> = {
  company: companyM,
  professional: professionalsM,
}

/**
 * Root-document tracker fields ('Updated By' in every company list column) after a publish.
 * Before this, publishing only stamped the change_request row itself (status/applied_at) and
 * wrote an audit log entry - the live company document's own updated_by/updated_by_row_id/
 * updated_date_n_time stayed whatever they were before the request existed, so a list sorted or
 * filtered by "recently updated" would miss a company whose only recent activity was a
 * publish (design gap surfaced by comparison against markets' publish flow, which stamps its
 * own root document the same way).
 */
type UpdateTrackerFields = { updated_by: 'admin' | 'subadmin' | 'user' | null; updated_by_row_id: number | null; updated_date_n_time: Date }

function rootDocumentTrackerFields(actor: ActorRef): UpdateTrackerFields {
  return {
    updated_by: actor.type === 'admin' || actor.type === 'subadmin' || actor.type === 'user' ? actor.type : null,
    updated_by_row_id: actor.id,
    updated_date_n_time: new Date(),
  }
}

const LOG_ACTION_PUBLISH = 'publish'
const ACTION_DELETE = 'delete'
const ACTION_UPDATE = 'update'

const NOT_FOUND_MESSAGE = 'Sorry, Invalid change request id'
const NOT_APPROVED_MESSAGE = 'Sorry, This change request has not been approved yet'
const INVALID_SECTION_MESSAGE = 'Sorry, Invalid section on this change request'
const EMPTY_PAYLOAD_MESSAGE = 'Sorry, This change request has nothing to apply'
const APPLY_FAILED_MESSAGE = 'Publishing failed. Please try again.'
const APPLIED_MESSAGE = 'Changes published successfully'

/**
 * Applies a pending change request to live data inside a MongoDB transaction, so the live write
 * and the request's status update either both land or neither does. This is the repo's first
 * transaction; replica-set connections were confirmed available (design §13.1 item 15).
 *
 * `apply_started_at` is stamped before the transaction opens, giving a detectable marker if the
 * process dies before the transaction commits. The actual live-data mutation is delegated to
 * applySectionWrite (change-request.apply.writers.ts), which knows how to shape it per section —
 * this function only orchestrates the transaction, status marking and logging.
 */
export async function applyChangeRequest({
  changeRequestId,
  actor,
  fieldKeys,
}: {
  changeRequestId: number
  actor: ActorRef
  /**
   * Field-level selective publish (user-requested, 2026-09-22): when given, only these field
   * names are published from the request's approved-and-unpublished set, leaving the rest
   * approved-but-still-unpublished for a later publish. Omitted entirely (undefined) preserves
   * the original behavior — every approved-and-unpublished field on the request gets published,
   * unchanged for existing callers (publish_change/:id, publishAllChangeRequests).
   */
  fieldKeys?: string[]
}): Promise<ApplyChangeRequestResult> {
  const request = await findRequestById(changeRequestId)
  if (!request) {
    return { status: false, message: { alert_message: NOT_FOUND_MESSAGE } }
  }
  if (!isKnownSection(request.section)) {
    logger.error({ changeRequestId, section: request.section }, 'change-request: unknown section on apply')
    return { status: false, message: { alert_message: INVALID_SECTION_MESSAGE } }
  }

  // Widened to the general SectionConfig (not the exact per-key literal type
  // SECTION_REGISTRY[request.section] would otherwise infer) so the customWriter branch
  // below type-checks uniformly across every section, most of which don't declare that field.
  const config: SectionConfig = SECTION_REGISTRY[request.section]

  // CONFIRMED DESIGN: field-level approval (UPDATE requests on a section with
  // `fieldLevelApproval: true` only - see SectionConfig.fieldLevelApproval's own doc comment, and
  // FieldChange.status's doc comment in status-audit.types.ts) never flips this request's own
  // top-level `status` to APPROVED - approveChangeRequestFields/rejectChangeRequestFields
  // (change-request.approve.ts/.review.ts) only ever touch individual changes[] entries, since a
  // request can have some fields approved, some still pending, at the same time. Gate on "at
  // least one field is approved and not yet published" instead of the whole-request status for
  // these sections; every other section keeps the original whole-request APPROVED gate.
  // Only engage field-level logic for a request that actually carries per-field statuses -
  // computeDiff stamps every field 'pending' unconditionally from here on (change-request.diff.ts),
  // but a request submitted BEFORE this shipped has no `status` on any change entry at all. Such
  // a request falls through to the original whole-request APPROVED gate below unchanged, so an
  // already-approved pre-existing request stays publishable in full exactly as before, instead of
  // silently becoming stuck (every field reading undefined, never 'approved', if this branch
  // engaged for it).
  const hasFieldLevelStatuses = (request.changes ?? []).some((c) => c.status !== undefined)
  const usesFieldLevelApproval = Boolean(config.fieldLevelApproval) && request.action === ACTION_UPDATE && hasFieldLevelStatuses

  // CONFIRMED BUG FIX (user-reported, 2026-09-28: publishing an already-approved field failed
  // with NOT_APPROVED_MESSAGE): the reviewer's checkbox selects by GROUP key when a section
  // declares `fieldGroups` (e.g. Events' `location` - `ChangeFieldDiffRows.tsx`'s own
  // `group.key = change.group ?? change.field`), so `fieldKeys` here can legitimately contain
  // 'location' while every real change entry's own `field` is 'event_venue'/'event_city'/etc -
  // `fieldKeys.includes(c.field)` never matched, so a selected-and-approved group always looked
  // unapproved. `approveChangeRequestFields`/`rejectChangeRequestFields` (change-request.approve.ts)
  // already expand a group key to its member fields via the section's own `fieldGroups` before
  // matching; publish now does the exact same expansion.
  const expandedFieldKeys = fieldKeys
    ? new Set(fieldKeys.flatMap((key) => config.fieldGroups?.[key] ?? [key]))
    : undefined
  const approvedUnpublished = usesFieldLevelApproval
    ? (request.changes ?? []).filter((c) => c.status === 'approved' && !c.published && (!expandedFieldKeys || expandedFieldKeys.has(c.field)))
    : []

  if (usesFieldLevelApproval) {
    if (approvedUnpublished.length === 0) {
      return { status: false, message: { alert_message: NOT_APPROVED_MESSAGE } }
    }
  } else if (request.status !== CHANGE_REQUEST_STATUS.APPROVED) {
    return { status: false, message: { alert_message: NOT_APPROVED_MESSAGE } }
  }

  // For a field-level section, this publish writes ONLY the fields just approved - everything
  // still pending, already published by an earlier partial publish, or rejected is excluded.
  const effectivePayload = usesFieldLevelApproval
    ? Object.fromEntries(approvedUnpublished.map((c) => [c.field, c.new_value]))
    : request.payload ?? {}
  const effectiveRequest: ChangeRequestDoc = usesFieldLevelApproval
    ? { ...request, payload: effectivePayload }
    : request

  // A delete's payload is correctly empty — nothing is being $set, the row is being removed.
  // Only document-scope updates and list-scope creates/updates require a non-empty payload.
  const fields = Object.keys(effectivePayload)
  if (fields.length === 0 && request.action !== ACTION_DELETE) {
    return { status: false, message: { alert_message: EMPTY_PAYLOAD_MESSAGE } }
  }

  const model = SECTION_MODELS[config.collection]
  if (!model) {
    logger.error({ changeRequestId, collection: config.collection }, 'change-request: no model registered')
    return { status: false, message: { alert_message: INVALID_SECTION_MESSAGE } }
  }

  await markApplyStarted(changeRequestId)

  let appliedFieldCount = 0
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      // Funding (Raised) and Acquisitions can't go through the generic single-row
      // applySectionWrite at all — a Funding round is N sibling rows sharing one round_id, and
      // an acquisition has no single "owning company" field at all (two independent company
      // sides) — see change-request.registry.ts's customWriter doc comments on both. Each gets
      // its own writer that fully replaces the generic one here rather than supplementing it.
      const result = config.customWriter
        ? await applyCustomSectionWrite({ request: effectiveRequest, session })
        : await applySectionWrite({ request: effectiveRequest, config, model, session })
      appliedFieldCount = result.appliedFieldCount
      if (usesFieldLevelApproval) {
        await markChangeRequestFieldsPublished({
          id: changeRequestId,
          fieldNames: approvedUnpublished.map((c) => c.field),
          session,
        })
        // CONFIRMED BUG FIX: a field-level request's own top-level `status` was never advanced
        // past APPROVED once every field finished publishing (only markChangeRequestFieldsPublished
        // ran, which only ever touches per-field `published` flags) — so a fully-published request
        // stayed permanently visible in findApprovedRequestsForEntity's `{status: APPROVED}` OR
        // clause and kept inflating the View page's "Publish (N)" count forever, even though there
        // was nothing left to publish. Reproduced live: publishing a Basic Details edit correctly
        // wrote the field and marked it `published: true`, but the request still showed up in
        // approved_changes and "Publish (1)" never went to 0 — a second publish attempt on it would
        // have found zero approved-unpublished fields and reported a confusing "Published 0 of 1".
        // Fixed by promoting the whole request to PUBLISHED (the same terminal status the
        // non-field-level branch already reaches via markApplied) once every change is resolved —
        // nothing left pending, and every approved field (the ones just published here, or already
        // published by an earlier partial publish) is accounted for. A request with some fields
        // still pending correctly stays at APPROVED so the next partial publish can still find it.
        const justPublished = new Set(approvedUnpublished.map((c) => c.field))
        const fullyResolved = (request.changes ?? []).every((c) => {
          const status = c.status ?? 'pending'
          if (status === 'pending') return false
          if (status === 'rejected') return true
          return c.published === true || justPublished.has(c.field)
        })
        if (fullyResolved) {
          await markApplied({ id: changeRequestId, actor, session })
        }
      } else {
        await markApplied({ id: changeRequestId, actor, session })
      }
      const rootModel = ROOT_MODELS[request.module]
      if (rootModel) {
        await rootModel.updateOne(
          { _id: request.root_document_id },
          { $set: rootDocumentTrackerFields(actor) },
          { session },
        )
      } else {
        logger.error({ changeRequestId, module: request.module }, 'change-request: no root model registered for module')
      }
    })
  } catch (err) {
    logger.error({ err, changeRequestId }, 'change-request: apply transaction failed')
    return { status: false, message: { alert_message: APPLY_FAILED_MESSAGE } }
  } finally {
    await session.endSession()
  }

  try {
    await insertChangeLog({
      module: request.module,
      target_collection: config.collection,
      target_row_id: request.target_row_id ?? request.root_document_id,
      root_document_id: request.root_document_id,
      section: request.section,
      action: LOG_ACTION_PUBLISH,
      actor,
      changes: usesFieldLevelApproval ? approvedUnpublished : request.changes,
      reason: null,
      snapshot: request.row_snapshot ?? null,
    })
  } catch (err) {
    logger.error({ err, changeRequestId }, 'change-request: publish log write failed')
  }

  // CONFIRMED BUG FIX: nothing here ever invalidated a section's Redis cache after a publish, so
  // every section's list/detail response kept serving pre-publish data until that cache's TTL
  // happened to expire on its own (confirmed report: a newly published Owned Product missing
  // from the products list, served straight from `cache_response_status: true`). Best-effort,
  // same convention as the insertChangeLog block above - a cache-invalidation failure doesn't
  // roll back the already-committed live write. Undefined for Basic Details only, whose own
  // applyBasicDetailsSideEffects below already invalidates its caches itself.
  try {
    await config.invalidateCache?.(request.root_document_id)
  } catch (err) {
    logger.error({ err, changeRequestId }, 'change-request: publish cache invalidation failed')
  }

  // Basic Details is the one section whose write needs MORE than the generic $set/create/delete
  // applySectionWrite already did inside the transaction above (SEO/social seeding or merging,
  // its own audit log, sub-admin notification, manual-company shift, profile score) — best-
  // effort, same convention as the insertChangeLog block above (a failure here doesn't roll back
  // the already-committed company-row write, matching how every other section's own post-commit
  // side effects — cache invalidation, notifications — were never transactional either, even
  // before change-request review existed).
  if (request.section === SECTION_BASIC_DETAILS) {
    try {
      await applyBasicDetailsSideEffects({
        action: request.action === 'create' ? 'create' : 'update',
        companyRowId: request.root_document_id,
        payload: effectivePayload,
        actor,
      })
    } catch (err) {
      logger.error({ err, changeRequestId }, 'change-request: basic details side effects failed')
    }
  } else if (request.section === SECTION_PROFESSIONAL_BASIC_DETAILS) {
    try {
      await applyProfessionalBasicDetailsSideEffects({
        action: request.action === 'create' ? 'create' : 'update',
        userRowId: request.root_document_id,
        payload: effectivePayload,
        actor,
      })
    } catch (err) {
      logger.error({ err, changeRequestId }, 'change-request: professional basic details side effects failed')
    }
  } else if (request.section === SECTION_PROFESSIONAL_STATUS) {
    try {
      await applyProfessionalStatusSideEffects({ request: effectiveRequest, actor })
    } catch (err) {
      logger.error({ err, changeRequestId }, 'change-request: professional status side effects failed')
    }
  } else if (request.section === SECTION_COMPANY_STATUS) {
    try {
      await applyCompanyStatusSideEffects({ request: effectiveRequest, actor })
    } catch (err) {
      logger.error({ err, changeRequestId }, 'change-request: company status side effects failed')
    }
  } else if (request.section === SECTION_EVENT_STATUS) {
    try {
      await applyEventStatusSideEffects({ request: effectiveRequest, actor })
    } catch (err) {
      logger.error({ err, changeRequestId }, 'change-request: event status side effects failed')
    }
  }

  // The published data now counts toward the record's profile score ("Profile Strength").
  await recalculateProfileScoreAfterChange({
    module: request.module,
    section: request.section,
    rootDocumentId: request.root_document_id,
    payload: effectivePayload,
  })

  return { status: true, message: { alert_message: APPLIED_MESSAGE }, appliedFieldCount }
}

const DIRECT_STATUS_SECTIONS: ReadonlySet<string> = new Set([SECTION_PROFESSIONAL_STATUS, SECTION_COMPANY_STATUS, SECTION_EVENT_STATUS])
const DIRECT_APPLY_FAILED_MESSAGE = 'Sorry, this action could not be completed. Please try again.'

/**
 * Applies a module-status action (first-time Approve / Reject of a Company, Professional or Event)
 * straight to live data - no change request is created, so nothing lands in Pending Changes and no
 * second approve/publish step exists (user-requested 2026-10-04: only the main admin and Marketing
 * Full Access can approve/reject a profile, so there is no maker to check). Reuses the exact same
 * section writer + side effects the publish flow runs for these sections, in the same transaction
 * shape, so the resulting state, emails, notifications, audit log and caches are identical to what a
 * published status request produced.
 */
export async function applyStatusActionDirectly({
  module,
  section,
  rootDocumentId,
  payload,
  actor,
  successMessage,
}: {
  module: string
  section: string
  rootDocumentId: number
  payload: Record<string, unknown>
  actor: ActorRef
  successMessage: string
}): Promise<{ status: boolean; message: { alert_message: string } }> {
  if (!isKnownSection(section) || !DIRECT_STATUS_SECTIONS.has(section)) {
    logger.error({ section }, 'change-request: direct apply attempted on a non-status section')
    return { status: false, message: { alert_message: DIRECT_APPLY_FAILED_MESSAGE } }
  }

  const config: SectionConfig = SECTION_REGISTRY[section]

  // Never persisted - only the shape the shared writers/side-effects read (payload + root id + actor).
  const request: ChangeRequestDoc = {
    _id: 0,
    module,
    target_collection: config.collection,
    target_row_id: null,
    root_document_id: rootDocumentId,
    section,
    action: ACTION_UPDATE as ChangeRequestDoc['action'],
    payload,
    changes: [],
    revision: 1,
    status: CHANGE_REQUEST_STATUS.APPROVED,
    requested_by: actor,
    requested_at: new Date(),
    apply_started_at: null,
    row_snapshot: null,
    rating: null,
    note: null,
  }

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await applyCustomSectionWrite({ request, session })
      const rootModel = ROOT_MODELS[module]
      if (rootModel) {
        await rootModel.updateOne({ _id: rootDocumentId }, { $set: rootDocumentTrackerFields(actor) }, { session })
      }
    })
  } catch (err) {
    logger.error({ err, section, rootDocumentId }, 'change-request: direct status apply transaction failed')
    return { status: false, message: { alert_message: DIRECT_APPLY_FAILED_MESSAGE } }
  } finally {
    await session.endSession()
  }

  try {
    await config.invalidateCache?.(rootDocumentId)
  } catch (err) {
    logger.error({ err, section, rootDocumentId }, 'change-request: direct status apply cache invalidation failed')
  }

  try {
    if (section === SECTION_PROFESSIONAL_STATUS) await applyProfessionalStatusSideEffects({ request, actor })
    else if (section === SECTION_COMPANY_STATUS) await applyCompanyStatusSideEffects({ request, actor })
    else await applyEventStatusSideEffects({ request, actor })
  } catch (err) {
    logger.error({ err, section, rootDocumentId }, 'change-request: direct status apply side effects failed')
  }

  return { status: true, message: { alert_message: successMessage } }
}

const DIRECT_EDIT_SAVED_MESSAGE = 'Changes saved successfully'

export interface ApplyEditDirectlyParams {
  module: string
  section: string
  scope: 'document' | 'child'
  action: ChangeRequestDoc['action']
  rootDocumentId: number
  targetRowId: number | null
  /** The fields being written (new values only) - empty for a child delete. */
  payload: Record<string, unknown>
  /** Display diff, recorded in the history log. */
  changes: ChangeRequestDoc['changes']
  /** Child delete only - the row being removed, kept in the history log. */
  rowSnapshot?: Record<string, unknown> | null
  actor: ActorRef
}

/**
 * Writes one section's edit straight to live data - no change request is created, so nothing lands
 * in Pending/Approved Changes and there is no approve/publish step. Used while the owning Company,
 * Professional or Event is itself still pending its first approval (see change-request.pending-gate.ts):
 * the admin who finally approves the record reviews all of it then. Runs the same section writer,
 * root-tracker stamp, cache invalidation and Basic Details side effects the publish flow runs, so the
 * resulting data is identical to what a published request would have produced.
 */
export async function applyEditDirectly({
  module,
  section,
  scope,
  action,
  rootDocumentId,
  targetRowId,
  payload,
  changes,
  rowSnapshot = null,
  actor,
}: ApplyEditDirectlyParams): Promise<{ status: boolean; message: { alert_message: string }; changeCount?: number }> {
  if (!isKnownSection(section)) {
    logger.error({ section }, 'change-request: direct edit on an unknown section')
    return { status: false, message: { alert_message: INVALID_SECTION_MESSAGE } }
  }

  const config: SectionConfig = SECTION_REGISTRY[section]
  const model = SECTION_MODELS[config.collection]
  if (!model) {
    logger.error({ section, collection: config.collection }, 'change-request: no model registered for direct edit')
    return { status: false, message: { alert_message: INVALID_SECTION_MESSAGE } }
  }

  // Never persisted - only the shape the shared section writers read.
  const request: ChangeRequestDoc = {
    _id: 0,
    module,
    target_collection: config.collection,
    target_row_id: targetRowId,
    root_document_id: rootDocumentId,
    section,
    scope,
    action,
    payload,
    changes: [],
    revision: 1,
    status: CHANGE_REQUEST_STATUS.APPROVED,
    requested_by: actor,
    requested_at: new Date(),
    apply_started_at: null,
    row_snapshot: rowSnapshot,
    rating: null,
    note: null,
  } as ChangeRequestDoc

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      if (config.customWriter) await applyCustomSectionWrite({ request, session })
      else await applySectionWrite({ request, config, model, session })
      const rootModel = ROOT_MODELS[module]
      if (rootModel) {
        await rootModel.updateOne({ _id: rootDocumentId }, { $set: rootDocumentTrackerFields(actor) }, { session })
      }
    })
  } catch (err) {
    logger.error({ err, module, section, rootDocumentId }, 'change-request: direct edit transaction failed')
    return { status: false, message: { alert_message: DIRECT_APPLY_FAILED_MESSAGE } }
  } finally {
    await session.endSession()
  }

  try {
    await insertChangeLog({
      module,
      target_collection: config.collection,
      target_row_id: targetRowId ?? rootDocumentId,
      root_document_id: rootDocumentId,
      section,
      action: LOG_ACTION_PUBLISH,
      actor,
      changes,
      reason: null,
      snapshot: rowSnapshot,
    })
  } catch (err) {
    logger.error({ err, section, rootDocumentId }, 'change-request: direct edit log write failed')
  }

  try {
    await config.invalidateCache?.(rootDocumentId)
  } catch (err) {
    logger.error({ err, section, rootDocumentId }, 'change-request: direct edit cache invalidation failed')
  }

  try {
    if (section === SECTION_BASIC_DETAILS) {
      await applyBasicDetailsSideEffects({ action: action === 'create' ? 'create' : 'update', companyRowId: rootDocumentId, payload, actor })
    } else if (section === SECTION_PROFESSIONAL_BASIC_DETAILS) {
      await applyProfessionalBasicDetailsSideEffects({ action: action === 'create' ? 'create' : 'update', userRowId: rootDocumentId, payload, actor })
    }
  } catch (err) {
    logger.error({ err, section, rootDocumentId }, 'change-request: direct edit side effects failed')
  }

  await recalculateProfileScoreAfterChange({ module, section, rootDocumentId, payload })

  return { status: true, message: { alert_message: DIRECT_EDIT_SAVED_MESSAGE }, changeCount: Math.max(changes.length, 1) }
}
