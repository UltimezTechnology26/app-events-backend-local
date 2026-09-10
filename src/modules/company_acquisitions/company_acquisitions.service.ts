const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { validateAcquisitionInput, AcquisitionInput } from './company_acquisitions.validation'
import {
  buildCompanyAcquisitionsListStages,
  findOwnCompanyRow,
  findMatchingAcquisition,
  findAcquisitionById,
  updateAcquisitionById,
  createAcquisition,
  deleteAcquisitionById,
  runCompanyAcquisitionsAggregation
} from './company_acquisitions.queries'
import { invalidateCompanyAcquisitionsCaches } from './company_acquisitions.cache'
import {
  AcquisitionRecord,
  AcquisitionWriteAttrs,
  DuplicateAcquisitionQuery,
  AcquisitionActionResult,
  AcquisitionListResult,
  AcquisitionActor
} from './company_acquisitions.types'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../common/change-request/change-request.child.service'
import { SECTION_ACQUISITIONS } from '../../common/change-request/change-request.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { AUDIT_MODULE_COMPANY } from '../../common/status-audit/status-audit.registry'
import { ChangeRequestDoc, SubmitChangeRequestResult } from '../../common/change-request/change-request.types'

const ADMIN_ROW_ID_MAIN_ADMIN = 0

/**
 * Resolves the registered company row owned by this user, if any. Mirrors
 * funding.service.ts's resolveOwnCompanyId — used to stop a company-owner
 * submission from naming an arbitrary company on either side of the deal.
 */
export async function resolveOwnCompanyId(userRowId: number): Promise<number | null> {
  const company = await findOwnCompanyRow(userRowId)
  return company ? Number.parseInt(String(company._id)) : null
}

/**
 * True if an active (pending or approved) record already exists for the exact
 * same acquirer/acquired pair ON THE SAME acquisition_date. Real-world M&A
 * allows the same two companies to appear together more than once (staged/
 * tranche acquisitions, a later re-acquisition after a divestment, etc.), so
 * the pair alone isn't a duplicate — only re-submitting the same dated event
 * is. Rejected records (verified_status 2) don't count, so a corrected
 * resubmission after rejection is still allowed. Excludes the record being
 * edited (excludeId), so updating an existing record doesn't flag itself as
 * a duplicate of itself.
 */
async function findDuplicateAcquisition(input: AcquisitionInput, excludeId?: number): Promise<boolean> {
  const query: DuplicateAcquisitionQuery = {
    acquirer_company_row_id: input.acquirer_company_row_id,
    acquirer_registered_type: input.acquirer_registered_type,
    acquired_company_row_id: input.acquired_company_row_id,
    acquired_registered_type: input.acquired_registered_type,
    acquisition_date: new Date(input.acquisition_date),
    verified_status: { $in: [0, 1] }
  }
  if (excludeId) {
    query._id = { $ne: excludeId }
  }
  const existing = await findMatchingAcquisition(query)
  return !!existing
}

export async function createOrUpdateAcquisition(params: {
  acquisition_row_id?: number
  input: AcquisitionInput
} & (
  | { submittedByType: 2; submittedByCompanyRowId: number }
  // Admin-only path (POST /update_details) — actor/editingCompanyRowId are required so the
  // publish gate below always has what it needs; there is no "admin write with no actor" case.
  | { submittedByType: 1; actor: AcquisitionActor; editingCompanyRowId: number }
)): Promise<AcquisitionActionResult | SubmitChangeRequestResult> {
  const { valid, errObj } = validateAcquisitionInput(params.input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  const isDuplicate = await findDuplicateAcquisition(params.input, params.acquisition_row_id)
  if (isDuplicate) {
    return {
      status: false,
      message: { acquired_company_row_id: 'An acquisition between these companies on this date has already been recorded and is pending or approved.' }
    }
  }

  // Publish gate applies to admin-panel writes (design §2, same shape as every other section)
  // — an admin submission previously auto-approved and wrote live immediately; now it submits a
  // change request instead. This is entirely separate from the PRE-EXISTING submit/verify/reject
  // workflow below (submittedByType 2, company-owner submissions) — that workflow's own pending
  // state (verified_status 0) is untouched, still starts pending and still resolves via
  // /verify or /reject, exactly as before.
  //
  // rootDocumentId is "whichever company's admin screen the edit was made from"
  // (editingCompanyRowId) — a deliberate design choice for this section's two-company shape.
  // The OTHER side of the deal rides along in the SAME submitted payload (not a separate write);
  // it just isn't what the pending change is filed/scoped under.
  if (params.submittedByType === 1) {
    if (!params.actor.status) {
      return { status: false, message: params.actor.message as Record<string, string> }
    }
    const adminRowId = Number(params.actor.message.user_row_id)
    const existing = params.acquisition_row_id ? await findAcquisitionById(params.acquisition_row_id) : null
    const liveValues = existing ? (typeof (existing as any).toObject === 'function' ? (existing as any).toObject() : { ...existing }) : {}

    return submitChildChangeRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_ACQUISITIONS,
      rootDocumentId: params.editingCompanyRowId,
      targetRowId: params.acquisition_row_id ?? null,
      liveValues,
      submitted: { ...params.input, acquisition_date: params.input.acquisition_date },
      actor: toActorRefWithId(
        { updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin', updated_by_row_id: adminRowId },
        adminRowId,
      ),
    })
  }

  const attrs: AcquisitionWriteAttrs = {
    _id: params.acquisition_row_id,
    ...params.input,
    acquisition_date: new Date(params.input.acquisition_date),
    submitted_by_type: params.submittedByType,
    submitted_by_company_row_id: params.submittedByCompanyRowId,
    verified_status: 0,
    verified_on: undefined,
    date_n_time: getPresentDateTime()
  }

  if (params.acquisition_row_id) {
    const updated = await updateAcquisitionById(params.acquisition_row_id, attrs)
    if (!updated) {
      return { status: false, message: { alert_message: 'Acquisition record not found.' } }
    }
  } else {
    await createAcquisition(attrs)
  }

  await invalidateCompanyAcquisitionsCaches()

  return { status: true, message: { alert_message: 'Acquisition record saved successfully.' } }
}

/**
 * The section-specific writer dispatched from change-request.apply.ts (via the registry's
 * customWriter flag) for a publish of the `acquisitions` section — mirrors
 * createOrUpdateAcquisition's admin-submission attrs exactly (submitted_by_type: 1,
 * auto-approved), but running inside the caller's publish transaction against a change
 * request's stored payload instead of a live request body. A delete just removes the row —
 * no soft-delete concept exists for this section (see registry doc comment).
 */
export async function applyAcquisitionWrite({
  request,
  session,
}: {
  request: ChangeRequestDoc
  session: unknown
}): Promise<{ appliedFieldCount: number }> {
  const companyAcquisitionsM = require('../../../models/app/company/companyAcquisitionsM')

  if (request.action === 'delete') {
    await companyAcquisitionsM.findByIdAndDelete(request.target_row_id, { session })
    return { appliedFieldCount: 0 }
  }

  const payload = (request.payload ?? {}) as Record<string, any>
  const present_date_n_time = getPresentDateTime()

  if (request.action === 'create') {
    // CREATE's payload always holds every field (diffed against an empty `liveValues: {}`, so
    // anything submitted counts as "changed") - no existing-row fallback needed here, only below.
    const attrs: AcquisitionWriteAttrs = {
      acquirer_registered_type: payload.acquirer_registered_type,
      acquirer_company_row_id: payload.acquirer_company_row_id,
      acquired_registered_type: payload.acquired_registered_type,
      acquired_company_row_id: payload.acquired_company_row_id,
      acquisition_date: new Date(payload.acquisition_date),
      acquisition_price: payload.acquisition_price,
      facilitators: payload.facilitators,
      stake_acquired_percent: payload.stake_acquired_percent,
      acquisition_multiple: payload.acquisition_multiple,
      submitted_by_type: 1,
      verified_status: 1,
      verified_on: present_date_n_time,
      date_n_time: present_date_n_time
    }
    const doc = new companyAcquisitionsM(attrs)
    await doc.save({ session })
    return { appliedFieldCount: 1 }
  }

  // CONFIRMED BUG FIX: a field-level-filtered update payload only carries the fields just
  // approved (submitChildChangeRequest's diff, further narrowed to approvedUnpublished by
  // applyChangeRequest) - every OTHER field used to read straight off `payload` as `undefined`,
  // which Mongoose silently omits from the update EXCEPT `acquisition_date`, built here as
  // `new Date(payload.acquisition_date)` - `new Date(undefined)` is an Invalid Date, a real value
  // that WOULD get written, corrupting the row's date the moment any update didn't itself touch
  // that field. Falling back to the pre-update live row for anything the diff omitted (same
  // pattern already fixed for Funding Round's own applyFundingRoundWrite) fixes it for every
  // partial field, not just acquisition_date.
  const existing = await companyAcquisitionsM.findById(request.target_row_id, {}, { session }).lean()
  const attrs: AcquisitionWriteAttrs = {
    acquirer_registered_type: payload.acquirer_registered_type ?? existing?.acquirer_registered_type,
    acquirer_company_row_id: payload.acquirer_company_row_id ?? existing?.acquirer_company_row_id,
    acquired_registered_type: payload.acquired_registered_type ?? existing?.acquired_registered_type,
    acquired_company_row_id: payload.acquired_company_row_id ?? existing?.acquired_company_row_id,
    acquisition_date: payload.acquisition_date ? new Date(payload.acquisition_date) : existing?.acquisition_date,
    acquisition_price: payload.acquisition_price ?? existing?.acquisition_price,
    facilitators: payload.facilitators ?? existing?.facilitators,
    stake_acquired_percent: payload.stake_acquired_percent ?? existing?.stake_acquired_percent,
    acquisition_multiple: payload.acquisition_multiple ?? existing?.acquisition_multiple,
    submitted_by_type: 1,
    verified_status: 1,
    verified_on: present_date_n_time,
    date_n_time: present_date_n_time
  }

  await companyAcquisitionsM.findByIdAndUpdate(request.target_row_id, attrs, { session })
  return { appliedFieldCount: 1 }
}

/**
 * Admin-only delete (GET /delete/:acquisition_row_id), gated the same way as
 * createOrUpdateAcquisition's admin path above — submits a pending delete instead of removing
 * the row immediately. editingCompanyRowId (whichever company's admin screen the delete was
 * clicked from) scopes the request the same way as the create/update path.
 */
export async function adminDeleteAcquisition(params: {
  actor: AcquisitionActor
  acquisitionRowId: number
  editingCompanyRowId: number
}): Promise<AcquisitionActionResult | SubmitChangeRequestResult> {
  if (!params.actor.status) {
    return { status: false, message: params.actor.message as Record<string, string> }
  }

  const record = await findAcquisitionById(params.acquisitionRowId)
  if (!record) {
    return { status: false, message: { alert_message: 'Acquisition record not found.' } }
  }

  const adminRowId = Number(params.actor.message.user_row_id)
  const rowSnapshot = typeof (record as any).toObject === 'function' ? (record as any).toObject() : { ...record }

  return submitChildDeleteRequest({
    module: AUDIT_MODULE_COMPANY,
    section: SECTION_ACQUISITIONS,
    rootDocumentId: params.editingCompanyRowId,
    targetRowId: params.acquisitionRowId,
    rowSnapshot,
    actor: toActorRefWithId(
      { updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin', updated_by_row_id: adminRowId },
      adminRowId,
    ),
  })
}

export async function verifyAcquisition(acquisitionRowId: number): Promise<AcquisitionActionResult> {
  const updated = await updateAcquisitionById(acquisitionRowId, {
    verified_status: 1,
    verified_on: getPresentDateTime()
  })
  if (!updated) {
    return { status: false, message: { alert_message: 'Acquisition record not found.' } }
  }
  await invalidateCompanyAcquisitionsCaches()
  return { status: true, message: { alert_message: 'Acquisition approved.' } }
}

export async function rejectAcquisition(params: {
  acquisitionRowId: number
  rejectType: number
  rejectReason: string
}): Promise<AcquisitionActionResult> {
  const updated = await updateAcquisitionById(params.acquisitionRowId, {
    verified_status: 2,
    reject_type: params.rejectType,
    reject_reason: params.rejectReason
  })
  if (!updated) {
    return { status: false, message: { alert_message: 'Acquisition record not found.' } }
  }
  await invalidateCompanyAcquisitionsCaches()
  return { status: true, message: { alert_message: 'Acquisition rejected.' } }
}

export async function deleteAcquisition(acquisitionRowId: number): Promise<AcquisitionActionResult> {
  const deleted = await deleteAcquisitionById(acquisitionRowId)
  if (!deleted) {
    return { status: false, message: { alert_message: 'Acquisition record not found.' } }
  }
  await invalidateCompanyAcquisitionsCaches()
  return { status: true, message: { alert_message: 'Acquisition deleted.' } }
}

/** True if companyId is the acquirer or acquired side (as a registered company) of this record. */
function isPartyToAcquisition(record: AcquisitionRecord, companyId: number): boolean {
  const ownsAcquirerSide = record.acquirer_registered_type === 1 && record.acquirer_company_row_id === companyId
  const ownsAcquiredSide = record.acquired_registered_type === 1 && record.acquired_company_row_id === companyId
  return ownsAcquirerSide || ownsAcquiredSide
}

/**
 * Company-owner delete: same effect as deleteAcquisition, but restricted to
 * the company that originally submitted the record (submitted_by_company_row_id)
 * — never trust a client-supplied acquisition_row_id alone (same reasoning
 * as the /submit ownership guard). The counterparty can approve or reject,
 * but never delete — that's the submitter's call alone, at any status
 * (pending, rejected, or even after approval, since it's their own
 * submission to retract). Admin-direct records (no submitting company) can't
 * be self-deleted by anyone via this path — only through the separate
 * admin-only /delete route.
 */
export async function deleteOwnAcquisition(params: {
  acquisitionRowId: number
  ownCompanyId: number
}): Promise<AcquisitionActionResult> {
  const record = await findAcquisitionById(params.acquisitionRowId)
  if (!record) {
    return { status: false, message: { alert_message: 'Acquisition record not found.' } }
  }

  if (record.submitted_by_company_row_id !== params.ownCompanyId) {
    return { status: false, message: { alert_message: 'Sorry, only the company that submitted this acquisition can delete it.' } }
  }

  return deleteAcquisition(params.acquisitionRowId)
}

/**
 * True if ownCompanyId may approve/reject this record as the counterparty:
 * a party to the deal, but NOT the company that submitted it (a submitter
 * can't approve their own submission). Admin's own authorization is handled
 * separately at the controller and doesn't call this.
 */
export async function isCounterpartyForAcquisition(acquisitionRowId: number, ownCompanyId: number): Promise<boolean> {
  const record = await findAcquisitionById(acquisitionRowId)
  if (!record) return false
  if (record.submitted_by_company_row_id === ownCompanyId) return false
  return isPartyToAcquisition(record, ownCompanyId)
}

export async function getCompanyAcquisitionsList(params: {
  companyRowId: number
  skip: number
  limit: number
}): Promise<AcquisitionListResult> {
  const stages = buildCompanyAcquisitionsListStages(params.companyRowId)
  const all = await runCompanyAcquisitionsAggregation(stages)
  return { status: true, message: all.slice(params.skip, params.skip + params.limit) }
}

/**
 * Admin per-company list: unlike the public getCompanyAcquisitionsList,
 * includes pending and rejected records too, so an admin can see and act on
 * (approve/reject) submissions that haven't been vetted yet.
 */
export async function getAdminCompanyAcquisitionsList(params: {
  companyRowId: number
  skip: number
  limit: number
}): Promise<AcquisitionListResult> {
  const stages = buildCompanyAcquisitionsListStages(params.companyRowId, true)
  const all = await runCompanyAcquisitionsAggregation(stages)
  return { status: true, message: all.slice(params.skip, params.skip + params.limit) }
}
