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
  AcquisitionListResult
} from './company_acquisitions.types'

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
  submittedByType: 1 | 2
  submittedByCompanyRowId?: number
}): Promise<AcquisitionActionResult> {
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

  const isAdminSubmission = params.submittedByType === 1

  const attrs: AcquisitionWriteAttrs = {
    _id: params.acquisition_row_id,
    ...params.input,
    acquisition_date: new Date(params.input.acquisition_date),
    submitted_by_type: params.submittedByType,
    submitted_by_company_row_id: isAdminSubmission ? undefined : params.submittedByCompanyRowId,
    verified_status: isAdminSubmission ? 1 : 0,
    verified_on: isAdminSubmission ? getPresentDateTime() : undefined,
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
