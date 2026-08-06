// modules/company_claim_requests/company_claim_requests.queries.ts
import { buildPaginatedFacetStages, extractPaginatedResult } from '../common/common.pagination'

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
  matchQuery: any
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

export function extractClaimRequestsPaginatedResult(aggregateOutput: any[]) {
  return extractPaginatedResult(aggregateOutput)
}

/** Builds the plain $match for claim_status (+ optional text search), shared by list/count. */
export function buildClaimRequestsMatchQuery({ claimStatus, search }: { claimStatus: number; search?: string }) {
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
