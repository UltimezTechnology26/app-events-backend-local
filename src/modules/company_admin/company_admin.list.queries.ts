// modules/company_admin/company_admin.list.queries.ts
import { extractPaginatedResult } from '../common/common.pagination'

const UPDATED_BY_FULL_NAME_SWITCH = {
  $switch: {
    branches: [
      {
        case: { $eq: ['$updated_by', 'user'] },
        then: { $let: { vars: { userInfo: { $arrayElemAt: ['$updated_by_user_info', 0] } }, in: { $ifNull: ['$$userInfo.full_name', ''] } } },
      },
      {
        case: { $eq: ['$updated_by', 'admin'] },
        then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } },
      },
      {
        case: { $eq: ['$updated_by', 'subadmin'] },
        then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } },
      },
    ],
    default: '',
  },
}

function buildCategoryStatusStage(categoryStatus?: number) {
  if (categoryStatus === undefined || Number.isNaN(categoryStatus) || ![0, 1].includes(categoryStatus)) {
    return []
  }
  const sizeExpr = { $size: { $ifNull: ['$business_info', []] } }
  return [{ $match: { $expr: categoryStatus === 1 ? { $gt: [sizeExpr, 0] } : { $eq: [sizeExpr, 0] } } }]
}

/**
 * Ports company.js's GET /list (approval_status:1, active_status:1) and GET /disabled_list
 * (active_status:0) `$and` match-building logic (Part 3 §7 Phase H step 4) — one
 * activeStatus-parameterized builder replaces both near-identical routes. `list`'s more general
 * "min-max" profile_score parsing is used for both (confirmed backward-compatible with
 * disabled_list's 4 hardcoded buckets — same 4 strings parse to the same ranges either way); the
 * extra filters (main_business_model_id/sub_admin_row_id/created_date_n_time/claim_status) are
 * additive no-ops for the disabled list, since its frontend page never sends them.
 */
export function buildCompanyListMatchQuery({
  activeStatus,
  search,
  mainBusinessModelId,
  subAdminRowId,
  profileScoreRange,
  createdDateRange,
  claimStatus,
}: {
  activeStatus: number
  search?: string
  mainBusinessModelId?: number
  subAdminRowId?: number
  profileScoreRange?: string
  createdDateRange?: { start_date: string; end_date: string }
  claimStatus?: number
}) {
  const statusClause = activeStatus === 1 ? { approval_status: 1, active_status: 1 } : { active_status: activeStatus }
  const and: Record<string, unknown>[] = [statusClause]

  if (search) {
    and.push({ $or: [{ company_name: { $regex: search, $options: 'i' } }, { company_id: { $regex: search, $options: 'i' } }, { company_email_id: { $regex: search, $options: 'i' } }] })
  }

  if (mainBusinessModelId !== undefined && !Number.isNaN(mainBusinessModelId)) {
    and.push({ main_business_model_id: mainBusinessModelId })
  }

  if (subAdminRowId !== undefined && !Number.isNaN(subAdminRowId)) {
    and.push({ sub_admin_row_id: subAdminRowId })
  }

  if (profileScoreRange) {
    const [min, max] = profileScoreRange.split('-').map(Number)
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      and.push({ profile_score: { $gte: min, $lte: max } })
    }
  }

  if (createdDateRange) {
    and.push({ created_date_n_time: { $gte: new Date(createdDateRange.start_date), $lte: new Date(createdDateRange.end_date) } })
  }

  if (claimStatus !== undefined && !Number.isNaN(claimStatus)) {
    and.push({ claim_status: claimStatus === 3 ? { $nin: [1, 2] } : claimStatus })
  }

  return { $and: and }
}

/**
 * Ports company.js's GET /list and GET /disabled_list aggregation pipelines (Part 3 §7 Phase H
 * step 4), $facet-converted per the standing list+count fix. Projects the union of both routes'
 * output fields (main_business_model_name from `list`; disable_reason/disabled_date_n_time from
 * `disabled_list`) — confirmed safe via both admin-coinpedia frontend pages, which read named
 * fields with optional-chaining fallbacks and silently ignore fields they don't use.
 */
export function buildCompanyListPipeline({
  matchQuery,
  categoryStatus,
  skip,
  limit,
}: {
  matchQuery: ReturnType<typeof buildCompanyListMatchQuery>
  categoryStatus?: number
  skip: number
  limit: number
}) {
  return [
    { $match: matchQuery },
    // CONFIRMED BUG FIX (live testing, 2026-08-11): the 5 display-only $lookups below
    // (professionals/partners/sub_admins/main_business_info) used to run on EVERY matched
    // company before $skip/$limit — e.g. all ~2,648 rows just to return a 20-row page,
    // measured at 115s+ against production data (disabled_list didn't even finish in 120s).
    // Only the business_info lookup affects which rows match (via buildCategoryStatusStage),
    // so it alone must stay ahead of pagination; the rest move inside the $facet's `data`
    // branch so they run on the already-paginated page only.
    {
      $lookup: {
        from: 'cln_static_company_business_models',
        localField: 'business_model_id',
        foreignField: '_id',
        pipeline: [{ $match: { active_status: true } }, { $project: { business_name: 1 } }],
        as: 'business_info',
      },
    },
    ...buildCategoryStatusStage(categoryStatus),
    { $sort: { _id: -1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
          { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_added_to_partners', localField: '_id', foreignField: 'company_row_id', as: 'partner' } },
          {
            $lookup: {
              from: 'cln_professionals',
              let: { updated_by_id: '$updated_by_row_id', updated_by_type: '$updated_by' },
              pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$_id', '$$updated_by_id'] }, { $eq: ['$$updated_by_type', 'user'] }] } } }, { $project: { full_name: 1 } }],
              as: 'updated_by_user_info',
            },
          },
          {
            $lookup: {
              from: 'cln_sub_admins',
              let: { updated_by_id: '$updated_by_row_id', updated_by_type: '$updated_by' },
              pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$_id', '$$updated_by_id'] }, { $in: ['$$updated_by_type', ['admin', 'subadmin']] }] } } }, { $project: { full_name: 1 } }],
              as: 'updated_by_admin_info',
            },
          },
          { $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_sub_admins', localField: 'sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info' } },
          { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'main_business_info', pipeline: [{ $project: { business_name: 1 } }] } },
          { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
          buildCompanyListProjectStage(),
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

function buildCompanyListProjectStage() {
  return {
    $project: {
      _id: 1,
      created_date_n_time: 1,
      company_name: 1,
      company_id: 1,
      company_email_id: 1,
      contact_number: 1,
      website_link: 1,
      company_logo: 1,
      business_model_id: 1,
      active_status: 1,
      approval_status: 1,
      user_row_id: 1,
      sub_admin_row_id: 1,
      claim_status: 1,
      disable_reason: 1,
      disabled_date_n_time: 1,
      main_business_model_name: '$main_business_info.business_name',
      business_name: '$business_info.business_name',
      created_user_name: '$user_info.full_name',
      partner_added_id: '$partner._id',
      sub_admin_name: '$sub_admin_info.full_name',
      sub_admin_username: '$sub_admin_info.user_name',
      basic_details_score: 1,
      seo_details_score: 1,
      social_media_score: 1,
      owned_product_score: 1,
      team_detail_score: 1,
      job_opening_score: 1,
      funding_score: 1,
      revenue_score_score: 1,
      investment_score: 1,
      faq_score: 1,
      holding_crypto_score: 1,
      profile_score: 1,
      updated_by: 1,
      updated_by_row_id: 1,
      updated_date_n_time: 1,
      updated_by_full_name: UPDATED_BY_FULL_NAME_SWITCH,
    },
  }
}

export function extractCompanyListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}
