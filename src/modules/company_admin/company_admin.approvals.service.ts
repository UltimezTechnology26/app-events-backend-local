// modules/company_admin/company_admin.approvals.service.ts
const companyM = require('../../../models/app/company/companyM')
const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')
const { getPresentDateTime, checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
const { deleteCompanyDetails } = require('../../../utils/helpers/app_helper')
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
const { updateNotification } = require('../../../utils/helpers/notification_helper')
const { sendEmail } = require('../../../config/email')
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
import {
  buildCompaniesListMatchQuery,
  buildCompaniesListPipeline,
  extractCompaniesListResult,
  buildDeletedListPipeline,
  extractDeletedListResult,
  buildDeletedListMatchQuery,
  findCompanyById,
  findCompaniesDisplayInfoByIds,
  findPendingApprovalCompanyById,
  updateCompanyApprovalFields,
} from './company_admin.approvals.queries'
import { Actor } from './company_admin.types'
import { recordCompanyStatusChange } from './company_admin.audit'
import { getPendingChangeRequestsAcrossEntities, getRejectedChangeRequestsAcrossEntities } from '../../common/change-request/change-request.service'
import { AUDIT_MODULE_COMPANY } from '../../common/status-audit/status-audit.registry'

export interface GetCompaniesListParams {
  approvalStatusRaw: string
  activeStatusRaw: string
  skipRaw: string
  limitRaw: string
  search?: string
  profileScoreRange?: string
  categoryStatusRaw?: string
}

/** Ports company_approvals.js's GET /companies_list/:approval_status/:active_status/:skip/:limit (lines 24-317), $facet-converted. */
export async function getCompaniesList({ approvalStatusRaw, activeStatusRaw, skipRaw, limitRaw, search, profileScoreRange, categoryStatusRaw }: GetCompaniesListParams) {
  const approvalStatus = Number.parseInt(approvalStatusRaw)
  const activeStatus = Number.parseInt(activeStatusRaw)
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  if (![0, 1, 2].includes(approvalStatus)) {
    return { status: false, message: { alert_message: 'Please enter according to  0:pending, 1:approved, 2:rejected' } }
  }

  const matchQuery = buildCompaniesListMatchQuery({ approvalStatus, activeStatus, search, profileScoreRange })
  const categoryStatus = categoryStatusRaw !== undefined ? Number.parseInt(categoryStatusRaw) : undefined
  const aggregateOutput = await companyM.aggregate(buildCompaniesListPipeline({ matchQuery, categoryStatus, skip, limit }))
  const { data, count } = extractCompaniesListResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface ApproveCompanyRequestParams {
  admin: Actor
  requestRowIdRaw: string
}

/** Ports company_approvals.js's GET /approve_request/:request_row_id (lines 319-385). */
export async function approveCompanyRequest({ admin, requestRowIdRaw }: ApproveCompanyRequestParams) {
  const queryRun = await findCompanyById(requestRowIdRaw)
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } }
  }

  const company_row_id = Number.parseInt(requestRowIdRaw)
  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(String(admin.message.admin_row_id)),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number.parseInt(String(admin.message.sub_admin_type)),
    company_row_id,
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const checkApprovalQuery = await findPendingApprovalCompanyById(requestRowIdRaw)
  if (!checkApprovalQuery) {
    return { status: false, message: { alert_message: 'Sorry, This Company cannot be approved' } }
  }

  const updateFields = getUpdateTrackerFields(admin)
  await updateCompanyApprovalFields(requestRowIdRaw, { approval_status: 1, ...updateFields, updated_date_n_time: new Date() })
  await recordCompanyStatusChange({
    documentId: company_row_id,
    action: 'approve',
    tracker: updateFields,
    adminRowId: admin.message.admin_row_id,
  })
  await deleteKeysByPattern('app_company_individual_details_*')
  await deleteKeysByPattern('app_company_list_*')

  const company_name = checkApprovalQuery.company_name
  const company_email_id = checkApprovalQuery.company_email_id

  if (queryRun.user_row_id) {
    await updateNotification({ user_row_id: queryRun.user_row_id, notify_type: 2, notify_type_row_id: company_row_id, message_row_id: 10, action_row_id: company_row_id })
  }

  const pass_subject = 'Your company ' + company_name + ' was Approved by the Admin. '
  const pass_message = `
    <p style="text-transform: capitalize;color:#000;font-weight: 500;font-size:22px;">Hello ${company_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Your Company <b style="text-transform: capitalize;">${company_name}</b> is reviewed and approved successfully by the admin. </p>
    <p style="color:#000;font-weight: 400;font-size:17px;"> You can now list and manage your events, update company details, add tokens, and access all the exciting features on Coinpedia.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login Now</a> </p>
    `
  await sendEmail(company_email_id, pass_subject, pass_message)

  return { status: true, message: { alert_message: 'Company approved successfully' } }
}

export interface RejectCompanyRequestParams {
  admin: Actor
  requestRowIdRaw: string
  reasonRejected: string
}

/** Ports company_approvals.js's POST /reject_request/:request_row_id (lines 387-484). */
export async function rejectCompanyRequest({ admin, requestRowIdRaw, reasonRejected }: RejectCompanyRequestParams) {
  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(String(admin.message.admin_row_id)),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number.parseInt(String(admin.message.sub_admin_type)),
    company_row_id: Number.parseInt(requestRowIdRaw),
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  let admin_row_id = 0
  if (admin.message.admin_manager_type == 2) {
    admin_row_id = Number(admin.message.admin_row_id)
  }

  const company_row_id = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Oops! Invalid Company Row Id' } }
  }

  const queryRun = await findCompanyById(company_row_id)
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Sorry! Invalid Request Row Id' } }
  }

  const checkApprovalQuery = await findPendingApprovalCompanyById(company_row_id)
  if (!checkApprovalQuery) {
    return { status: false, message: { alert_message: 'Sorry! This Company cannot be rejected' } }
  }

  const company_name = checkApprovalQuery.company_name
  const company_email_id = checkApprovalQuery.company_email_id

  const pass_subject = 'CoinPedia Company Profile Request Denied'
  const pass_message = `
    <p style="text-transform: capitalize;color:#000;font-weight: 500;font-size:22px;">Dear  ${company_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your CoinPedia Company Profile account application has been denied.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reject Reason : </b>${reasonRejected}</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Your interest is appreciated, and we invite you to <a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;">Register<a> to CoinPedia for more information!</p>
    `
  await sendEmail(company_email_id, pass_subject, pass_message)

  const updateFields = getUpdateTrackerFields(admin)
  const updateArray = {
    approval_status: 2,
    approval_sub_admin_row_id: admin_row_id,
    reason_rejected: reasonRejected,
    rejected_date_n_time: getPresentDateTime(),
    ...updateFields,
  }
  await updateCompanyApprovalFields(company_row_id, updateArray)
  await recordCompanyStatusChange({
    documentId: company_row_id,
    action: 'reject',
    tracker: updateFields,
    adminRowId: admin.message.admin_row_id,
    reason: reasonRejected,
  })
  await deleteKeysByPattern('app_company_individual_details_*')
  await deleteKeysByPattern('app_company_list_*')

  if (queryRun.user_row_id) {
    await updateNotification({ user_row_id: queryRun.user_row_id, notify_type: 2, notify_type_row_id: company_row_id, message_row_id: 11, action_row_id: company_row_id })
  }

  return { status: true, message: { alert_message: 'Company rejected successfully' } }
}

export interface DeleteCompanyRequestParams {
  admin: Actor
  requestRowIdRaw: string
}

/** Ports company_approvals.js's GET /delete_company/:request_row_id (lines 486-528). */
export async function deleteCompanyRequest({ admin, requestRowIdRaw }: DeleteCompanyRequestParams) {
  const request_row_id = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(request_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  const queryRun = await findCompanyById(request_row_id)
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Sorry! Invalid Request Row Id' } }
  }

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(String(admin.message.admin_row_id)),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number.parseInt(String(admin.message.sub_admin_type)),
    company_row_id: request_row_id,
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  await deleteCompanyDetails({ company_row_id: queryRun._id })
  // `queryRun` was fetched before the delete, so it is the only surviving copy of the
  // row once deleteCompanyDetails has relocated it out of cln_company_lists.
  await recordCompanyStatusChange({
    documentId: request_row_id,
    action: 'delete',
    tracker: getUpdateTrackerFields(admin),
    adminRowId: admin.message.admin_row_id,
    snapshot: queryRun,
  })

  return { status: true, message: { alert_message: 'Company Deleted successfully' } }
}

export interface GetGlobalPendingChangesParams {
  skipRaw: string
  limitRaw: string
}

export interface PendingChangeQueueRow {
  change_request_id: number
  section: string
  revision: number
  requested_by: unknown
  requested_at: Date
  changes: unknown[]
  root_document_id: number
  entity: { company_row_id: number; company_name: string | null; company_id: string | null; company_logo: string | null } | null
}

/**
 * Global cross-entity pending-changes queue — every company's pending requests together, one
 * paginated list, mirroring markets' `GET /change_requests/:skip/:limit`. The common
 * change-request service returns bare requests; this is where they gain the entity display
 * info (name/id/logo) the queue's UI needs, via one bulk `$in` lookup rather than N+1 queries.
 */
export async function getGlobalPendingChangeRequests({ skipRaw, limitRaw }: GetGlobalPendingChangesParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { message: requests, count } = await getPendingChangeRequestsAcrossEntities({ module: AUDIT_MODULE_COMPANY, skip, limit })

  const companyIds = Array.from(new Set(requests.map((request) => request.root_document_id)))
  const companies = companyIds.length > 0 ? await findCompaniesDisplayInfoByIds(companyIds) : []
  const companyById = new Map(companies.map((company: { _id: number }) => [company._id, company]))

  const data: PendingChangeQueueRow[] = requests.map((request) => {
    const company = companyById.get(request.root_document_id) as
      | { _id: number; company_name?: string; company_id?: string; company_logo?: string }
      | undefined
    return {
      ...request,
      entity: company
        ? { company_row_id: company._id, company_name: company.company_name ?? null, company_id: company.company_id ?? null, company_logo: company.company_logo ?? null }
        : null,
    }
  })

  return { status: true, message: data, count }
}

export interface RejectedChangeQueueRow {
  change_request_id: number
  section: string
  revision: number
  requested_by: unknown
  requested_at: Date
  reviewed_by: unknown
  reviewed_at: Date | null
  reason: string | null
  changes: unknown[]
  root_document_id: number
  entity: { company_row_id: number; company_name: string | null; company_id: string | null; company_logo: string | null } | null
}

/**
 * Global cross-entity rejected-changes queue — same shape as getGlobalPendingChangeRequests
 * above, mirroring markets' own Pending/Rejected Changes tab pair.
 */
export async function getGlobalRejectedChangeRequests({ skipRaw, limitRaw }: GetGlobalPendingChangesParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { message: requests, count } = await getRejectedChangeRequestsAcrossEntities({ module: AUDIT_MODULE_COMPANY, skip, limit })

  const companyIds = Array.from(new Set(requests.map((request) => request.root_document_id)))
  const companies = companyIds.length > 0 ? await findCompaniesDisplayInfoByIds(companyIds) : []
  const companyById = new Map(companies.map((company: { _id: number }) => [company._id, company]))

  const data: RejectedChangeQueueRow[] = requests.map((request) => {
    const company = companyById.get(request.root_document_id) as
      | { _id: number; company_name?: string; company_id?: string; company_logo?: string }
      | undefined
    return {
      ...request,
      entity: company
        ? { company_row_id: company._id, company_name: company.company_name ?? null, company_id: company.company_id ?? null, company_logo: company.company_logo ?? null }
        : null,
    }
  })

  return { status: true, message: data, count }
}

export interface GetDeletedCompaniesListParams {
  skipRaw: string
  limitRaw: string
  search?: string
}

/** Ports company_approvals.js's GET /deleted_list/:skip/:limit (lines 532-602), $facet-converted. */
export async function getDeletedCompaniesList({ skipRaw, limitRaw, search }: GetDeletedCompaniesListParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100

  const matchQuery = buildDeletedListMatchQuery(search)
  const aggregateOutput = await company_deleted_historyM.aggregate(buildDeletedListPipeline({ matchQuery, skip, limit }))
  const { data, count } = extractDeletedListResult(aggregateOutput)

  return { status: true, message: data, count }
}
