import { ActorRef, FieldChange } from '../status-audit/status-audit.types'
import {
  CHANGE_REQUEST_STATUS,
  ChangeRequestDoc,
  ChangeRequestInput,
  REQUEST_PROJECTION,
} from './change-request.types'
import { deriveRequestStatus } from './change-request.status'

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

// A field-level request (Basic Details/SEO/Social Media UPDATE - see FieldChange.status's doc
// comment) never flips its own top-level `status` away from PENDING - approveChangeRequestFields/
// rejectChangeRequestFields only ever touch individual changes[] entries. So `status: PENDING`
// alone would keep matching it forever, even once every field has a decision. Excluding a
// request whose derived_status is 'resolved' (no field left pending) closes that gap; a request
// that never got a derived_status at all (every non-field-level request, and legacy data) is
// untouched by this condition.
const PENDING_FIELD_LEVEL_FILTER = { $or: [{ derived_status: { $exists: false } }, { derived_status: { $ne: 'resolved' } }] }

export async function findPendingRequestsForEntity({
  module,
  rootDocumentId,
}: {
  module: string
  rootDocumentId: number
}): Promise<ChangeRequestDoc[]> {
  return change_requestM
    .find(
      { module, root_document_id: rootDocumentId, status: CHANGE_REQUEST_STATUS.PENDING, ...PENDING_FIELD_LEVEL_FILTER },
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
      {
        module,
        root_document_id: rootDocumentId,
        // A field-level request's own top-level `status` never becomes APPROVED (see
        // PENDING_FIELD_LEVEL_FILTER's doc comment) - it can still have individual approved,
        // unpublished fields ready to go live while top-level status stays PENDING. Include it
        // here too so the Company View page's "Publish (N)" count and Publish action see it,
        // alongside every whole-request-APPROVED request from every other section.
        $or: [
          { status: CHANGE_REQUEST_STATUS.APPROVED },
          { changes: { $elemMatch: { status: 'approved', published: { $ne: true } } } },
        ],
      },
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
    { $match: { module, status: CHANGE_REQUEST_STATUS.PENDING, ...PENDING_FIELD_LEVEL_FILTER } },
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
 *
 * CONFIRMED BUG FIX: matched only the whole-request `status: REJECTED`, so a field-level
 * rejection (rejectChangeRequestFields only ever touches its own changes[] entry - same reason
 * PENDING_FIELD_LEVEL_FILTER exists above) never appeared here at all. Rejecting one of several
 * fields on an otherwise-still-pending request made that field's rejection invisible everywhere -
 * reported live: reject one field out of 3+ on a request, and it's simply missing from Rejected
 * Changes. Same `$elemMatch` fallback already used for the approved list.
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
    {
      $match: {
        module,
        $or: [
          { status: CHANGE_REQUEST_STATUS.REJECTED },
          { changes: { $elemMatch: { status: 'rejected' } } },
        ],
      },
    },
    // CONFIRMED BUG FIX: a field-level rejection (rejectChangeRequestFields) only ever stamps
    // reviewed_at on the individual changes[] entry it touched - the request's own top-level
    // reviewed_at stays null forever for these, since the request never gets a whole-request
    // decision. Sorting on the plain top-level `reviewed_at` therefore sank every field-level
    // rejection to the bottom (Mongo sorts missing/null as the lowest value), no matter how
    // recently it happened, while whole-request rejections sorted correctly among themselves -
    // "latest rejected on top" was silently broken for the far more common field-level case.
    // latest_rejected_at takes whichever is newer: the whole-request reviewed_at, or the newest
    // reviewed_at among this request's own rejected fields.
    {
      $addFields: {
        latest_rejected_at: {
          $max: [
            '$reviewed_at',
            {
              $max: {
                $map: {
                  input: { $filter: { input: '$changes', as: 'c', cond: { $eq: ['$$c.status', 'rejected'] } } },
                  as: 'c',
                  in: '$$c.reviewed_at',
                },
              },
            },
          ],
        },
      },
    },
    { $sort: { latest_rejected_at: -1 } },
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
 *
 * CONFIRMED BUG FIX: this never recomputed `derived_status`, so amending a request that had
 * previously gone fully field-level-resolved (every field approved/rejected, `derived_status:
 * 'resolved'`) left that stale 'resolved' value in place even after merging in genuinely new,
 * undecided fields. `findPendingRequest` matches on the legacy top-level `status` (which
 * approve/reject never flips away from PENDING - see PENDING_FIELD_LEVEL_FILTER's own doc
 * comment), so a second edit to an already-resolved section amends the SAME document instead of
 * starting a fresh one - and PENDING_FIELD_LEVEL_FILTER then excludes it from every pending list
 * because of that stale `derived_status`, even though it now has fresh fields awaiting review.
 * Reproduced live: editing Basic Details a second time after every field from the first edit had
 * been approved returned `"Changes submitted for approval"` but the request never appeared in
 * Pending Changes. Recomputing here from the merged `changes` (same `deriveRequestStatus` used
 * everywhere else) fixes it for both the create and amend paths equally.
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
        derived_status: deriveRequestStatus(changes),
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

interface FieldActionParams {
  id: number
  fieldKeys: string[]
  actor: ActorRef
}

/**
 * Shared by approveChangeRequestFields/rejectChangeRequestFields below - updates only the
 * changes[] entries whose `field` is in fieldKeys (each entry gets perFieldSet merged in plus
 * reviewed_by/reviewed_at), leaving every other entry untouched, then recomputes and stores the
 * request's own derived_status from the resulting mix (see change-request.status.ts).
 */
async function updateFieldStatuses(params: FieldActionParams, perFieldSet: Partial<FieldChange>): Promise<void> {
  const request = await change_requestM.findOne({ _id: params.id }, REQUEST_PROJECTION).lean()
  if (!request) return

  const changes: FieldChange[] = request.changes ?? []
  const setOps: Record<string, unknown> = {}
  changes.forEach((change, index) => {
    if (!params.fieldKeys.includes(change.field)) return
    for (const [key, value] of Object.entries(perFieldSet)) {
      setOps[`changes.${index}.${key}`] = value
    }
    setOps[`changes.${index}.reviewed_by`] = params.actor
    setOps[`changes.${index}.reviewed_at`] = new Date()
    changes[index] = { ...change, ...perFieldSet }
  })
  setOps.derived_status = deriveRequestStatus(changes)

  await change_requestM.updateOne({ _id: params.id }, { $set: setOps })
}

export async function approveChangeRequestFields(
  params: FieldActionParams & { rating: number; note?: string }
): Promise<void> {
  await updateFieldStatuses(params, { status: 'approved', rating: params.rating, reject_reason: null })
}

export async function rejectChangeRequestFields(
  params: FieldActionParams & { reason: string }
): Promise<void> {
  await updateFieldStatuses(params, { status: 'rejected', reject_reason: params.reason, rating: null })
}

/**
 * Called from inside applyChangeRequest's publish transaction (change-request.apply.ts) right
 * after the approved subset's values have actually been written live - marks just those
 * changes[] entries `published: true` (an approved-but-not-yet-published field stays eligible
 * for a later publish; a published one is excluded from the next one) and recomputes
 * derived_status. Runs in the SAME session so a mid-transaction failure rolls this back too.
 */
export async function markChangeRequestFieldsPublished(params: {
  id: number
  fieldNames: string[]
  session?: unknown
}): Promise<void> {
  const options = params.session === undefined ? {} : { session: params.session }
  const request = await change_requestM.findOne({ _id: params.id }, REQUEST_PROJECTION, options).lean()
  if (!request) return

  const changes: FieldChange[] = request.changes ?? []
  const setOps: Record<string, unknown> = {}
  changes.forEach((change, index) => {
    if (!params.fieldNames.includes(change.field)) return
    setOps[`changes.${index}.published`] = true
    changes[index] = { ...change, published: true }
  })
  setOps.derived_status = deriveRequestStatus(changes)

  await change_requestM.updateOne({ _id: params.id }, { $set: setOps }, options)
}
