import mongoose from 'mongoose'
import logger from '../../../config/logger'
import { ActorRef } from '../status-audit/status-audit.types'
import { insertChangeLog } from '../status-audit/status-audit.queries'
import { COMPANY_SECTION_REGISTRY, SECTION_BASIC_DETAILS, SECTION_FUNDING_ROUND, SECTION_ACQUISITIONS, SectionConfig, isCompanySection } from './change-request.registry'
import { findRequestById, markApplied, markApplyStarted } from './change-request.queries'
import { ApplyChangeRequestResult, ChangeRequestDoc, CHANGE_REQUEST_STATUS } from './change-request.types'
import { applySectionWrite, SECTION_MODELS } from './change-request.apply.writers'
import { applyBasicDetailsSideEffects } from '../../modules/company/settings/company.settings.service'
import { applyFundingRoundWrite } from '../../modules/funding/funding.service'
import { applyAcquisitionWrite } from '../../modules/company_acquisitions/company_acquisitions.service'

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
    default:
      throw new Error(`change-request: no custom writer registered for section '${request.section}'`)
  }
}

const companyM = require('../../../models/app/company/companyM')

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
}: {
  changeRequestId: number
  actor: ActorRef
}): Promise<ApplyChangeRequestResult> {
  const request = await findRequestById(changeRequestId)
  if (!request) {
    return { status: false, message: { alert_message: NOT_FOUND_MESSAGE } }
  }
  if (request.status !== CHANGE_REQUEST_STATUS.APPROVED) {
    return { status: false, message: { alert_message: NOT_APPROVED_MESSAGE } }
  }
  if (!isCompanySection(request.section)) {
    logger.error({ changeRequestId, section: request.section }, 'change-request: unknown section on apply')
    return { status: false, message: { alert_message: INVALID_SECTION_MESSAGE } }
  }

  // A delete's payload is correctly empty — nothing is being $set, the row is being removed.
  // Only document-scope updates and list-scope creates/updates require a non-empty payload.
  const payload = request.payload ?? {}
  const fields = Object.keys(payload)
  if (fields.length === 0 && request.action !== ACTION_DELETE) {
    return { status: false, message: { alert_message: EMPTY_PAYLOAD_MESSAGE } }
  }

  // Widened to the general SectionConfig (not the exact per-key literal type
  // COMPANY_SECTION_REGISTRY[request.section] would otherwise infer) so the customWriter branch
  // below type-checks uniformly across every section, most of which don't declare that field.
  const config: SectionConfig = COMPANY_SECTION_REGISTRY[request.section]
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
        ? await applyCustomSectionWrite({ request, session })
        : await applySectionWrite({ request, config, model, session })
      appliedFieldCount = result.appliedFieldCount
      await markApplied({ id: changeRequestId, actor, session })
      await companyM.updateOne(
        { _id: request.root_document_id },
        { $set: rootDocumentTrackerFields(actor) },
        { session },
      )
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
      changes: request.changes,
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
        payload,
        actor,
      })
    } catch (err) {
      logger.error({ err, changeRequestId }, 'change-request: basic details side effects failed')
    }
  }

  return { status: true, message: { alert_message: APPLIED_MESSAGE }, appliedFieldCount }
}
