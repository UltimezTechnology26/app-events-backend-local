// modules/company_claim_requests/company_claim_requests.queries.ts
import { buildPaginatedFacetStages, extractPaginatedResult } from '../common/common.pagination'
import {
  ClaimRequestRecord,
  NewClaimRequestInput,
  ClaimantBasicInfo,
  ClaimCompanyRecord,
  CompanyCreatedByAdminRecord,
  ClaimRequestsListRow,
  ClaimRequestDetailRow,
  ClaimRequestsMatchQuery,
  FacetAggregateResult,
} from './company_claim_requests.types'

const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const company_created_by_adminM = require('../../../models/app/company/company_created_by_adminM')
const company_claim_requestsM = require('../../../models/app/company/company_claim_requestsM')

/**
 * Ports controllers/admin_panel/app/company/claim_requests.js's GET /list/:claim_status/:skip/:limit
 * (lines 15-215). Real source ran the list aggregate, then ONLY ran a second, separate count
 * aggregate `if (queryRun.length > 0)` — meaning a page past the last result (or any filter whose
 * current page happens to be empty) silently reported count:0 even when earlier pages exist, the
 * same class of bug fixed on every other migrated list route this engagement. $facet-converted so
 * list and count come from one aggregation call and can't structurally drift apart.
 */
export function buildClaimRequestsListPipeline({
  claimStatus,
  matchQuery,
  skip,
  limit,
}: {
  claimStatus: number
  matchQuery: ClaimRequestsMatchQuery
  skip: number
  limit: number
}) {
  return [
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [
          { $match: { login_status: 1 } },
          { $project: { _id: 1, user_name: 1, full_name: 1, pro_batch: 1, email_id: 1, approval_status: 1 } },
        ],
      },
    },
    { $unwind: { path: '$user_info' } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { active_status: 1 } },
          { $project: { _id: 1, company_name: 1, company_id: 1, company_email_id: 1, website_link: 1 } },
        ],
      },
    },
    { $unwind: { path: '$company_info' } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_email_id: '$company_info.company_email_id',
        website_link: '$company_info.website_link',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        pro_batch: '$user_info.pro_batch',
        approval_status: '$user_info.approval_status',
      },
    },
    { $match: matchQuery },
    {
      $project: {
        _id: 1,
        claim_type: 1,
        date_n_time: 1,
        created_date_n_time: '$date_n_time',
        claim_action_date_n_time: 1,
        claim_rejected_reason: 1,
        company_name: 1,
        company_id: 1,
        company_email_id: 1,
        website_link: 1,
        contact_number: '$company_info.contact_number',
        company_logo: '$company_info.company_logo',
        user_name: 1,
        approval_status: 1,
        full_name: 1,
        email_id: 1,
        pro_batch: 1,
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

export function extractClaimRequestsPaginatedResult(aggregateOutput: FacetAggregateResult<ClaimRequestsListRow>[]) {
  return extractPaginatedResult(aggregateOutput)
}

/** Builds the plain $match for claim_status (+ optional text search), shared by list/count. */
export function buildClaimRequestsMatchQuery({ claimStatus, search }: { claimStatus: number; search?: string }): ClaimRequestsMatchQuery {
  if (!search) {
    return { claim_status: claimStatus }
  }

  return {
    $and: [
      {
        $or: [
          { company_name: { $regex: search, $options: 'i' } },
          { company_id: { $regex: search, $options: 'i' } },
          { company_email_id: { $regex: search, $options: 'i' } },
          { user_name: { $regex: search, $options: 'i' } },
          { full_name: { $regex: search, $options: 'i' } },
          { email_id: { $regex: search, $options: 'i' } },
        ],
      },
      { claim_status: claimStatus },
    ],
  }
}

// ─── company_claim_requestsM CRUD ────────────────────────────────────────────

export async function findExistingPendingClaimRequest(user_row_id: number | string, company_row_id: number): Promise<ClaimRequestRecord | null> {
  return company_claim_requestsM.findOne({ user_row_id, company_row_id, claim_status: 1 })
}

export async function createClaimRequest(input: NewClaimRequestInput): Promise<ClaimRequestRecord> {
  return new company_claim_requestsM(input).save()
}

export async function updateClaimRequestStatus(
  request_row_id: number | string,
  fields: { claim_status: number; claim_action_date_n_time: Date; claim_rejected_reason?: string },
): Promise<void> {
  await company_claim_requestsM.updateOne({ _id: request_row_id }, { $set: fields })
}

/**
 * Ports claim_requests.js's GET /approve_request/:request_row_id's inline aggregate (lines
 * 217-374) — a single-row lookup of the claim request joined to its user/company info, distinct
 * from buildClaimRequestsListPipeline (this one is unpaginated, matches by _id, and only requires
 * claim_status: 1).
 */
export function buildClaimRequestApprovalDetailPipeline(requestRowId: number) {
  return [
    { $match: { _id: requestRowId, claim_status: 1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        claim_type: 1,
        user_row_id: 1,
        company_row_id: 1,
        date_n_time: 1,
        claim_action_date_n_time: 1,
        claim_rejected_reason: 1,
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_email_id: '$company_info.company_email_id',
        website_link: '$company_info.website_link',
        contact_number: '$company_info.contact_number',
        company_logo: '$company_info.company_logo',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
      },
    },
  ]
}

export async function aggregateClaimRequestApprovalDetail(requestRowId: number): Promise<ClaimRequestDetailRow[]> {
  return company_claim_requestsM.aggregate(buildClaimRequestApprovalDetailPipeline(requestRowId))
}

/**
 * Ports claim_requests.js's POST /reject_request/:request_row_id's inline aggregate (lines
 * 376-495) — same joined shape as the approval detail pipeline above, but with the lookups run
 * before the $match (stage order preserved exactly as the real source has it, not reordered).
 */
export function buildClaimRequestRejectionDetailPipeline(requestRowId: number) {
  return [
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $match: { _id: requestRowId, claim_status: 1 } },
    {
      $project: {
        _id: 1,
        user_row_id: 1,
        claim_type: 1,
        date_n_time: 1,
        claim_action_date_n_time: 1,
        claim_rejected_reason: 1,
        company_row_id: 1,
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_email_id: '$company_info.company_email_id',
        website_link: '$company_info.website_link',
        contact_number: '$company_info.contact_number',
        company_logo: '$company_info.company_logo',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
      },
    },
  ]
}

export async function aggregateClaimRequestRejectionDetail(requestRowId: number): Promise<ClaimRequestDetailRow[]> {
  return company_claim_requestsM.aggregate(buildClaimRequestRejectionDetailPipeline(requestRowId))
}

export async function aggregateClaimRequestsList({
  matchQuery,
  claimStatus,
  skip,
  limit,
}: {
  matchQuery: ClaimRequestsMatchQuery
  claimStatus: number
  skip: number
  limit: number
}): Promise<FacetAggregateResult<ClaimRequestsListRow>[]> {
  return company_claim_requestsM.aggregate(buildClaimRequestsListPipeline({ claimStatus, matchQuery, skip, limit }))
}

// ─── professionalsM lookups ───────────────────────────────────────────────────

export async function findClaimantBasicInfo(user_row_id: number | string): Promise<ClaimantBasicInfo | null> {
  return professionalsM.findOne({ _id: user_row_id }, { _id: 1, email_id: 1, full_name: 1 })
}

export async function findProfessionalById(user_row_id: number): Promise<ClaimantBasicInfo | null> {
  return professionalsM.findOne({ _id: user_row_id })
}

// ─── companyM lookups / updates ───────────────────────────────────────────────

export async function findApprovedCompanyByEmail(company_email_id: string, company_row_id: number): Promise<ClaimCompanyRecord | null> {
  return companyM.findOne({ company_email_id, _id: company_row_id, approval_status: 1, active_status: 1 })
}

export async function findApprovedCompanyByDomain(emailDomainPattern: string, company_row_id: number): Promise<ClaimCompanyRecord | null> {
  return companyM.findOne({ website_link: { $regex: emailDomainPattern, $options: 'i' }, _id: company_row_id, approval_status: 1, active_status: 1 })
}

export async function findApprovedActiveCompanyById(company_row_id: number): Promise<ClaimCompanyRecord | null> {
  return companyM.findOne({ _id: company_row_id, approval_status: 1, active_status: 1 })
}

export async function findCompanyByUserRowId(user_row_id: number | string): Promise<ClaimCompanyRecord | null> {
  return companyM.findOne({ user_row_id })
}

export async function findCompanyById(company_row_id: number): Promise<ClaimCompanyRecord | null> {
  return companyM.findOne({ _id: company_row_id })
}

export async function findCompanyByIdAndClaimStatus(company_row_id: number, claim_status: number): Promise<ClaimCompanyRecord | null> {
  return companyM.findOne({ _id: company_row_id, claim_status })
}

export async function updateCompanyOwnership(company_row_id: number, fields: Record<string, unknown>): Promise<void> {
  await companyM.updateOne({ _id: company_row_id }, { $set: fields })
}

// ─── company_created_by_adminM lookups / updates ─────────────────────────────

export async function findCompanyCreatedByAdmin(company_row_id: number): Promise<CompanyCreatedByAdminRecord | null> {
  return company_created_by_adminM.findOne({ company_row_id })
}

export async function findCompanyCreatedByAdminByVerifyCode(company_row_id: number, claim_verify_code: string): Promise<CompanyCreatedByAdminRecord | null> {
  return company_created_by_adminM.findOne({ company_row_id, claim_verify_code })
}

export async function updateCompanyCreatedByAdminVerifyCode(company_row_id: number, claim_verify_code: string): Promise<void> {
  await company_created_by_adminM.updateOne({ company_row_id }, { $set: { claim_verify_code } })
}

export async function updateCompanyCreatedByAdminClaimStatus(company_row_id: number, claim_status: number): Promise<void> {
  await company_created_by_adminM.updateOne({ company_row_id }, { $set: { claim_status } })
}
