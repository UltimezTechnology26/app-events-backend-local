const companyAcquisitionsM = require('../../models/app/company/companyAcquisitionsM')
const { getPresentDateTime } = require('../../utils/helpers/helper')
import { validateAcquisitionInput, AcquisitionInput } from './company_acquisitions.validation'
import { buildCompanyAcquisitionsListStages } from './company_acquisitions.queries'
import { invalidateCompanyAcquisitionsCaches } from './company_acquisitions.cache'

export async function createOrUpdateAcquisition(params: {
  acquisition_row_id?: number
  input: AcquisitionInput
  submittedByType: 1 | 2
}): Promise<{ status: boolean; message: any }> {
  const { valid, errObj } = validateAcquisitionInput(params.input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  const isAdminSubmission = params.submittedByType === 1

  const attrs = {
    _id: params.acquisition_row_id,
    ...params.input,
    acquisition_date: new Date(params.input.acquisition_date),
    submitted_by_type: params.submittedByType,
    verified_status: isAdminSubmission ? 1 : 0,
    verified_on: isAdminSubmission ? getPresentDateTime() : undefined,
    date_n_time: getPresentDateTime()
  }

  if (params.acquisition_row_id) {
    const updated = await companyAcquisitionsM.findByIdAndUpdate(params.acquisition_row_id, attrs, { new: true })
    if (!updated) {
      return { status: false, message: { alert_message: 'Acquisition record not found.' } }
    }
  } else {
    const doc = new companyAcquisitionsM(attrs)
    Object.assign(doc, attrs)

    await doc.save()
  }

  await invalidateCompanyAcquisitionsCaches()

  return { status: true, message: { alert_message: 'Acquisition record saved successfully.' } }
}

export async function verifyAcquisition(acquisitionRowId: number): Promise<{ status: boolean; message: any }> {
  const updated = await companyAcquisitionsM.findByIdAndUpdate(
    acquisitionRowId,
    { verified_status: 1, verified_on: getPresentDateTime() },
    { new: true }
  )
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
}): Promise<{ status: boolean; message: any }> {
  const updated = await companyAcquisitionsM.findByIdAndUpdate(
    params.acquisitionRowId,
    { verified_status: 2, reject_type: params.rejectType, reject_reason: params.rejectReason },
    { new: true }
  )
  if (!updated) {
    return { status: false, message: { alert_message: 'Acquisition record not found.' } }
  }
  await invalidateCompanyAcquisitionsCaches()
  return { status: true, message: { alert_message: 'Acquisition rejected.' } }
}

export async function deleteAcquisition(acquisitionRowId: number): Promise<{ status: boolean; message: any }> {
  const deleted = await companyAcquisitionsM.findByIdAndDelete(acquisitionRowId)
  if (!deleted) {
    return { status: false, message: { alert_message: 'Acquisition record not found.' } }
  }
  await invalidateCompanyAcquisitionsCaches()
  return { status: true, message: { alert_message: 'Acquisition deleted.' } }
}

export async function getCompanyAcquisitionsList(params: {
  companyRowId: number
  skip: number
  limit: number
}): Promise<{ status: boolean; message: any[] }> {
  const stages = buildCompanyAcquisitionsListStages(params.companyRowId)
  const all = await companyAcquisitionsM.aggregate(stages)
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
}): Promise<{ status: boolean; message: any[] }> {
  const stages = buildCompanyAcquisitionsListStages(params.companyRowId, true)
  const all = await companyAcquisitionsM.aggregate(stages)
  return { status: true, message: all.slice(params.skip, params.skip + params.limit) }
}
