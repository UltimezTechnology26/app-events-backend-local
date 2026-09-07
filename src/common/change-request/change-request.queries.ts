import { ActorRef, FieldChange } from '../status-audit/status-audit.types'
import {
  CHANGE_REQUEST_STATUS,
  ChangeRequestDoc,
  ChangeRequestInput,
  REQUEST_PROJECTION,
} from './change-request.types'

const change_requestM = require('../../../models/common/change_requestM')

export type { ChangeRequestDoc, ChangeRequestInput }

/**
 * Finds any in-flight (not-yet-published) request for a section — status `PENDING` or
 * `APPROVED`. `APPROVED` means reviewed but not yet live, so it must still be treated as the
 * baseline for a new edit; otherwise a second submission would create a duplicate request
 * instead of amending the approved-but-unpublished one.
 */
export async function findPendingRequest({
  module,
  rootDocumentId,
  section,
}: {
  module: string
  rootDocumentId: number
  section: string
}): Promise<ChangeRequestDoc | null> {
  return change_requestM
    .findOne(
      {
        module,
        root_document_id: rootDocumentId,
        section,
        status: { $in: [CHANGE_REQUEST_STATUS.PENDING, CHANGE_REQUEST_STATUS.APPROVED] },
      },
      REQUEST_PROJECTION,
    )
    .lean()
}

export async function findPendingRequestsForEntity({
  module,
  rootDocumentId,
}: {
  module: string
  rootDocumentId: number
}): Promise<ChangeRequestDoc[]> {
  return change_requestM
    .find(
      { module, root_document_id: rootDocumentId, status: CHANGE_REQUEST_STATUS.PENDING },
      REQUEST_PROJECTION,
    )
    .sort({ requested_at: -1 })
    .lean()
}

// Explicit projection — CLAUDE.md forbids `SELECT *`. Separate from REQUEST_PROJECTION because
// the approved-list UI needs reviewer/rating/note fields the pending-list UI never reads.
const APPROVED_REQUEST_PROJECTION = {
  ...REQUEST_PROJECTION,
  reviewed_by: 1,
  reviewed_at: 1,
} as const

export async function findApprovedRequestsForEntity({
  module,
  rootDocumentId,
}: {
  module: string
  rootDocumentId: number
}): Promise<(ChangeRequestDoc & { reviewed_by: ActorRef | null; reviewed_at: Date | null })[]> {
  return change_requestM
    .find(
      { module, root_document_id: rootDocumentId, status: CHANGE_REQUEST_STATUS.APPROVED },
      APPROVED_REQUEST_PROJECTION,
    )
    .sort({ requested_at: -1 })
    .lean()
}

export async function findRequestById(id: number): Promise<ChangeRequestDoc | null> {
  return change_requestM.findOne({ _id: id }, REQUEST_PROJECTION).lean()
}

/**
 * Global cross-entity queue: every pending request for a module, across every root document,
 * not just one — mirrors markets' `GET /change_requests/:skip/:limit`. Pure data access (no
 * entity name/logo enrichment); the caller's own module owns the $lookup into its own entity
 * collection, keeping company-specific knowledge out of this shared file.
 */
export async function findPendingRequestsPaginated({
  module,
  skip,
  limit,
}: {
  module: string
  skip: number
  limit: number
}): Promise<{ data: ChangeRequestDoc[]; count: number }> {
  const aggregateOutput = await change_requestM.aggregate([
    { $match: { module, status: CHANGE_REQUEST_STATUS.PENDING } },
    { $sort: { requested_at: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }, { $project: REQUEST_PROJECTION }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ])

  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, count: facetResult.totalCount[0]?.count ?? 0 }
}

// Same reasoning as APPROVED_REQUEST_PROJECTION above — the rejected-list UI needs reviewer/
// reason fields the pending-list UI never reads.
const REJECTED_REQUEST_PROJECTION = {
  ...REQUEST_PROJECTION,
  reviewed_by: 1,
  reviewed_at: 1,
  reason: 1,
} as const

/**
 * Global cross-entity queue: every rejected request for a module, across every root document —
 * same shape as findPendingRequestsPaginated above, mirroring markets' own Pending/Rejected
 * Changes tab pair. Pure data access; entity name/logo enrichment is the caller's own module's
 * job (see company_admin.approvals.service.ts's getGlobalRejectedChangeRequests).
 */
export async function findRejectedRequestsPaginated({
  module,
  skip,
  limit,
}: {
  module: string
  skip: number
  limit: number
}): Promise<{ data: (ChangeRequestDoc & { reviewed_by: ActorRef | null; reviewed_at: Date | null; reason: string | null })[]; count: number }> {
  const aggregateOutput = await change_requestM.aggregate([
    { $match: { module, status: CHANGE_REQUEST_STATUS.REJECTED } },
    { $sort: { reviewed_at: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }, { $project: REJECTED_REQUEST_PROJECTION }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ])

  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, count: facetResult.totalCount[0]?.count ?? 0 }
}

/** `create()` triggers the model's pre('save') hook, which assigns the numeric _id. */
export async function insertChangeRequest(doc: ChangeRequestInput): Promise<number> {
  const created = await change_requestM.create({ ...doc, status: CHANGE_REQUEST_STATUS.PENDING })
  return created._id
}

/**
 * Amend-while-pending. Replaces payload and changes and re-stamps the requester, so the row
 * reflects the latest submitter. Earlier authorship is not lost: every submission also writes a
 * cln_change_logs entry (see change-request.service.ts).
 */
export async function amendPendingRequest({
  id,
  payload,
  changes,
  actor,
}: {
  id: number
  payload: Record<string, unknown>
  changes: FieldChange[]
  actor: ActorRef
}): Promise<void> {
  await change_requestM.updateOne(
    { _id: id },
    {
      $set: {
        payload,
        changes,
        requested_by: actor,
        requested_at: new Date(),
        status: CHANGE_REQUEST_STATUS.PENDING,
      },
      $inc: { revision: 1 },
    },
  )
}

/** Stamped before the apply transaction, so an abandoned apply is detectable. */
export async function markApplyStarted(id: number): Promise<void> {
  await change_requestM.updateOne({ _id: id }, { $set: { apply_started_at: new Date() } })
}

export async function markApplied({
  id,
  actor,
  session,
}: {
  id: number
  actor: ActorRef
  session?: unknown
}): Promise<void> {
  const options = session === undefined ? {} : { session }
  await change_requestM.updateOne(
    { _id: id },
    {
      $set: {
        status: CHANGE_REQUEST_STATUS.PUBLISHED,
        applied_at: new Date(),
      },
    },
    options,
  )
}

export async function markApproved({
  id,
  actor,
  rating,
  note,
}: {
  id: number
  actor: ActorRef
  rating: number
  note: string
}): Promise<void> {
  await change_requestM.updateOne(
    { _id: id },
    { $set: { status: CHANGE_REQUEST_STATUS.APPROVED, reviewed_by: actor, reviewed_at: new Date(), rating, note } },
  )
}

export async function markRejected({
  id,
  actor,
  reason,
}: {
  id: number
  actor: ActorRef
  reason: string
}): Promise<void> {
  await change_requestM.updateOne(
    { _id: id },
    {
      $set: {
        status: CHANGE_REQUEST_STATUS.REJECTED,
        reviewed_by: actor,
        reviewed_at: new Date(),
        reason,
      },
    },
  )
}

/**
 * Hard delete. Decision §13.1(13): a cancel by the submitter leaves no trace and behaves as a
 * delete button, unlike a reject, which is recorded in full.
 */
export async function deleteChangeRequest(id: number): Promise<void> {
  await change_requestM.deleteOne({ _id: id })
}
