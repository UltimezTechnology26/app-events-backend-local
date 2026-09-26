// modules/company_admin/company_admin.approvals.service.ts
const companyM = require('../../../models/app/company/companyM')
const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')
const { checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
const { deleteCompanyDetails } = require('../../../utils/helpers/app_helper')
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
import {
  buildCompaniesListMatchQuery,
  buildCompaniesListPipeline,
  extractCompaniesListResult,
  buildDeletedListPipeline,
  extractDeletedListResult,
  buildDeletedListMatchQuery,
  findCompanyById,
  findCompaniesDisplayInfoByIds,
} from './company_admin.approvals.queries'
import { Actor } from './company_admin.types'
import { recordCompanyStatusChange } from './company_admin.audit'
import { getPendingChangeRequestsAcrossEntities, getRejectedChangeRequestsAcrossEntities, getApprovedChangeRequestsAcrossEntities } from '../../modules/change-request/change-request.service'
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

export interface ApprovedChangeQueueRow {
  change_request_id: number
  section: string
  revision: number
  requested_by: unknown
  requested_at: Date
  reviewed_by: unknown
  reviewed_at: Date | null
  rating: number | null
  note: string | null
  changes: unknown[]
  root_document_id: number
  derived_status?: 'pending' | 'partially_completed' | 'resolved'
  entity: { company_row_id: number; company_name: string | null; company_id: string | null; company_logo: string | null } | null
}

/**
 * Global cross-entity approved-but-unpublished-changes queue — same shape as
 * getGlobalPendingChangeRequests/getGlobalRejectedChangeRequests above (user-requested Approved
 * Changes queue, 2026-09-22).
 */
export async function getGlobalApprovedChangeRequests({ skipRaw, limitRaw }: GetGlobalPendingChangesParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { message: requests, count } = await getApprovedChangeRequestsAcrossEntities({ module: AUDIT_MODULE_COMPANY, skip, limit })

  const companyIds = Array.from(new Set(requests.map((request) => request.root_document_id)))
  const companies = companyIds.length > 0 ? await findCompaniesDisplayInfoByIds(companyIds) : []
  const companyById = new Map(companies.map((company: { _id: number }) => [company._id, company]))

  const data: ApprovedChangeQueueRow[] = requests.map((request) => {
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
