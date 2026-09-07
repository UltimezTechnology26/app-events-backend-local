/** Company sub-document resolved by resolveCompanySideStages's $lookup — shape
 * differs slightly between a registered company (cln_company_lists) and a
 * manual/unclaimed one (cln_company_manual_retrievals), so every non-_id
 * field is optional to cover both projections. */
export interface AcquisitionCompanyInfo {
  _id: number
  company_name?: string
  company_id?: number
  active_status?: number
  approval_status?: number
  company_logo?: string
}

/** Mirrors the cln_company_acquisitions Mongoose schema (companyAcquisitionsM). */
export interface AcquisitionRecord {
  _id: number
  acquirer_registered_type: number
  acquirer_company_row_id: number
  acquired_registered_type: number
  acquired_company_row_id: number
  acquisition_date: Date
  acquisition_price?: number
  facilitators?: string
  stake_acquired_percent: number
  acquisition_multiple?: number
  verified_status: number
  verified_on?: Date
  reject_type?: number
  reject_reason?: string
  submitted_by_type?: number
  submitted_by_company_row_id?: number
  date_n_time?: Date
}

/** Result row shape produced by buildCompanyAcquisitionsListStages's aggregation
 * pipeline: the base record plus the resolved acquirer/acquired company info
 * and the computed viewing direction. */
export interface AcquisitionListItem extends AcquisitionRecord {
  acquirer_info?: AcquisitionCompanyInfo
  acquired_info?: AcquisitionCompanyInfo
  direction: 'acquired' | 'acquired_by'
}

/** Attrs shape passed to companyAcquisitionsM's constructor/findByIdAndUpdate
 * from createOrUpdateAcquisition — AcquisitionInput plus the server-computed
 * bookkeeping fields. verified_on/date_n_time come from getPresentDateTime(),
 * which returns a formatted string (Mongoose casts it to Date on save). */
export interface AcquisitionWriteAttrs {
  _id?: number
  acquirer_registered_type: number
  acquirer_company_row_id: number
  acquired_registered_type: number
  acquired_company_row_id: number
  acquisition_date: Date
  acquisition_price?: number
  facilitators?: string
  stake_acquired_percent: number
  acquisition_multiple?: number
  submitted_by_type: number
  submitted_by_company_row_id?: number
  verified_status: number
  verified_on?: string
  reject_type?: number
  reject_reason?: string
  date_n_time: string
}

/** Filter shape used by findDuplicateAcquisition's exact-match lookup. */
export interface DuplicateAcquisitionQuery {
  acquirer_company_row_id: number
  acquirer_registered_type: number
  acquired_company_row_id: number
  acquired_registered_type: number
  acquisition_date: Date
  verified_status: { $in: number[] }
  _id?: { $ne: number }
}

/** Minimal projection of a company row (cln_company_lists) resolved by
 * resolveOwnCompanyId — only _id is ever selected. */
export interface OwnCompanyRow {
  _id: number
}

/** Common shape of every non-list service response: a plain string-keyed
 * message object, whether it's a single { alert_message } or a per-field
 * validation errObj. */
export interface AcquisitionActionResult {
  status: boolean
  message: Record<string, string>
}

/** Shape returned by the two list-fetching service functions. */
export interface AcquisitionListResult {
  status: boolean
  message: AcquisitionListItem[]
}

/** Raw `checkAllLoginToken(req.headers, [1, 7])` result, threaded from controller into service exactly as every other company module does (see `company.settings.service.ts`'s own local `Actor` type). */
export interface AcquisitionActorMessage {
  user_type: number
  user_row_id: number
}

export type AcquisitionActor =
  | { status: true; message: AcquisitionActorMessage }
  | { status: false; message: unknown }
