// modules/professionals/professionals.list.queries.ts
//
// Ports user.js's GET /list/:skip/:limit (~line 1062-1499) and GET /admin_created_list/:skip/:limit
// (~line 2756-2975) aggregation-building logic. Query/pipeline shape is otherwise ported
// verbatim (including every $lookup and the designation/looking_for in-memory-set-membership
// optimization already applied to /list) — the only structural change is $facet-converting both
// so data + count come from one aggregate call instead of two separate ones, matching
// company_admin.list.queries.ts's standing fix.
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'
import { joinPositionNamesExpr } from '../funding/funding.queries'
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

/** Ports /list's base $and clause array (approval/login-status union + every optional filter). */
export function buildProfessionalListMatchQuery({
  search,
  claimStatus,
  loginStatus,
  approvalStatus,
  subAdminRowId,
  profileScoreRange,
}: {
  search?: string
  claimStatus?: number
  loginStatus?: number
  approvalStatus?: number
  subAdminRowId?: number
  profileScoreRange?: string
}): Record<string, unknown>[] {
  const query: Record<string, unknown>[] = [
    {
      $or: [{ login_status: 1, approval_status: 0 }, { login_status: 1, approval_status: 1 }, { login_status: 0 }, { login_status: 1, approval_status: 2 }],
    },
  ]

  if (search) {
    query.push({
      $or: [
        { full_name: { $regex: search, $options: 'i' } },
        { user_name: { $regex: search, $options: 'i' } },
        { mobile_number: { $regex: search, $options: 'i' } },
        { email_id: { $regex: search, $options: 'i' } },
      ],
    })
  }

  if (claimStatus !== undefined && !Number.isNaN(claimStatus)) {
    query.push({ claim_status: claimStatus })
  }

  if (loginStatus !== undefined && !Number.isNaN(loginStatus)) {
    query.push({ login_status: loginStatus })
  }

  if (approvalStatus !== undefined && !Number.isNaN(approvalStatus)) {
    query.push({ approval_status: approvalStatus })
  }

  if (subAdminRowId !== undefined && !Number.isNaN(subAdminRowId)) {
    query.push({ sub_admin_row_id: subAdminRowId })
  }

  if (profileScoreRange) {
    const [min, max] = profileScoreRange.split('-').map(Number)
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      query.push({ profile_score: { $gte: min, $lte: max } })
    }
  }

  return query
}

/** Builds the designation_status/looking_for_status $expr filters against precomputed active-id sets (ported verbatim from /list — no change, just relocated). */
export function buildDesignationLookingForMatchConditions({
  designationStatus,
  activeDesignationIds,
  lookingForStatus,
  activeLookingForIds,
}: {
  designationStatus?: number
  activeDesignationIds?: number[] | null
  lookingForStatus?: number
  activeLookingForIds?: number[] | null
}): Record<string, unknown>[] {
  const matchConditions: Record<string, unknown>[] = []

  if (activeDesignationIds) {
    const hasActiveDesignation = {
      $gt: [{ $size: { $setIntersection: [{ $ifNull: ['$designation_id', []] }, activeDesignationIds] } }, 0],
    }
    matchConditions.push({ $expr: designationStatus === 1 ? hasActiveDesignation : { $not: hasActiveDesignation } })
  }

  if (activeLookingForIds) {
    const hasActiveLookingFor = {
      $gt: [{ $size: { $setIntersection: [{ $ifNull: ['$looking_for_id', []] }, activeLookingForIds] } }, 0],
    }
    matchConditions.push({ $expr: lookingForStatus === 1 ? hasActiveLookingFor : { $not: hasActiveLookingFor } })
  }

  return matchConditions
}

/**
 * Sort options for the "All Professionals" list, matching `company_admin.list.queries.ts`'s own
 * `COMPANY_LIST_SORT_MAP` pattern exactly (this list had no sort control at all in legacy or in
 * the ported module until now — added per the same "Sort By" convention Live Companies already
 * established, not a legacy port). Anything unrecognized (including no `sortBy` at all) falls
 * back to the existing hardcoded default, unchanged.
 */
const PROFESSIONAL_LIST_SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  name: { full_name: 1 },
  score: { profile_score: -1 },
  oldest: { _id: 1 },
  newest: { _id: -1 },
}

/**
 * $facet-converted version of /list's aggregation pipeline (CONFIRMED PERF FIX: the real route
 * ran this same lookup-heavy pipeline once for the page of data — already correctly ordered with
 * $skip/$limit before the $lookups — and then ran a SEPARATE second aggregate call just for the
 * count. One $facet call replaces both, so the two numbers can't structurally drift and Mongo
 * only has to plan/execute one aggregation).
 */
export function buildProfessionalListPipeline({ matchQuery, matchConditions, skip, limit, sortBy }: { matchQuery: Record<string, unknown>[]; matchConditions: Record<string, unknown>[]; skip: number; limit: number; sortBy?: string }) {
  const sortStage = (sortBy && PROFESSIONAL_LIST_SORT_MAP[sortBy]) || { _id: -1 }
  return [
    { $match: { $and: matchQuery } },
    { $sort: sortStage },
    ...(matchConditions.length ? [{ $match: { $and: matchConditions } }] : []),
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'co_info' } },
          { $unwind: { path: '$co_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'userImage' } },
          { $unwind: { path: '$userImage', preserveNullAndEmptyArrays: true } },
          // CONFIRMED BUG FIX (2026-09-17): `cln_professionals.email_verify_status` is a schema
          // field that's never actually written by the verify-email flow - `verifyEmailAccount`
          // (professionals.self-service.service.ts) only ever updates the *separate*
          // `cln_auth_verify_emails` collection's own `email_verify_status`, so the root
          // document's copy stays at its `default: false` forever. Projecting it directly (as
          // this pipeline did) meant every professional showed as unverified regardless of real
          // status. Joined the real source of truth here, matching the Admin Created pipeline's
          // already-correct `cln_auth_verify_emails` lookup below.
          { $lookup: { from: 'cln_auth_verify_emails', localField: '_id', foreignField: 'user_row_id', as: 'email_info' } },
          { $unwind: { path: '$email_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_sub_admins', localField: 'sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info' } },
          { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_static_user_looking_for_lists',
              localField: 'looking_for_id',
              foreignField: '_id',
              as: 'other_info',
              pipeline: [{ $match: { active_status: true } }, { $project: { _id: 1, name: 1 } }],
            },
          },
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
          {
            $lookup: {
              from: 'cln_static_user_designations',
              localField: 'designation_id',
              foreignField: '_id',
              as: 'designation_info',
              pipeline: [{ $match: { active_status: true } }, { $project: { _id: 0, designation_name: 1 } }],
            },
          },
          { $set: { designation_info: { $cond: [{ $gt: [{ $size: '$designation_info' }, 0] }, '$designation_info', null] } } },
          {
            $lookup: {
              from: 'cln_professionals_work_experiences',
              localField: '_id',
              foreignField: 'user_row_id',
              pipeline: [
                { $match: { public_view: true, user_account_type: 1 } },
                ...getPositionResolutionStages(),
                { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
                { $limit: 1 },
                {
                  $lookup: {
                    from: 'cln_company_lists',
                    let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                    as: 'info_company',
                    pipeline: [{ $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }, { $project: { _id: 1, company_name: 1 } }],
                  },
                },
                { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
                {
                  $lookup: {
                    from: 'cln_company_manual_retrievals',
                    let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                    as: 'info_manual_company',
                    pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }, { $project: { _id: 1, company_name: 1 } }],
                  },
                },
                { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
                {
                  $project: {
                    position_name: '$resolved_position_name',
                    positions: 1,
                    company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
                  },
                },
              ],
              as: 'info_work',
            },
          },
          { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_professionals_followers',
              let: { userId: '$_id' },
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$following_user_row_id', '$$userId'] }, { $eq: ['$confirm_request_status', 2] }] } } },
                { $group: { _id: '$following_user_row_id', count: { $sum: 1 } } },
              ],
              as: 'followers_count_arr',
            },
          },
          {
            $set: {
              total_followers_count: {
                $cond: {
                  if: { $and: [{ $eq: ['$login_status', 1] }, { $eq: ['$approval_status', 1] }] },
                  then: { $ifNull: [{ $arrayElemAt: ['$followers_count_arr.count', 0] }, 0] },
                  else: 0,
                },
              },
            },
          },
          {
            $project: {
              _id: 1,
              login_status: 1,
              created_date_n_time: 1,
              full_name: 1,
              user_name: 1,
              mobile_number: 1,
              email_id: 1,
              email_verify_status: '$email_info.email_verify_status',
              approval_status: 1,
              wallet_address: 1,
              position_name: '$info_work.position_name',
              positions: '$info_work.positions',
              company_name: '$info_work.company_name',
              sub_admin_name: '$sub_admin_info.full_name',
              sub_admin_row_id: 1,
              claim_status: 1,
              country_name: '$co_info.country_name',
              country_flag: '$co_info.country_flag',
              profile_image: '$userImage.profile_image',
              referral_user_name: 1,
              pro_batch: 1,
              professional_profile_score: 1,
              seo_details_score: 1,
              social_media_score: 1,
              academy_score: 1,
              community_score: 1,
              professional_detail_score: 1,
              investment_score: 1,
              award_score: 1,
              faq_score: 1,
              profile_score: 1,
              designation_array: '$designation_info.designation_name',
              looking_for_id: 1,
              looking_for: '$other_info',
              total_followers_count: 1,
              updated_by: 1,
              updated_by_row_id: 1,
              updated_date_n_time: 1,
              updated_by_full_name: UPDATED_BY_FULL_NAME_SWITCH,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractProfessionalListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}

/** Ports /admin_created_list's base $and clause (claim_status > 0 + approval/login-status union + optional filters). */
export function buildAdminCreatedListMatchQuery({ search, profileScoreRange }: { search?: string; profileScoreRange?: string }): Record<string, unknown>[] {
  const query: Record<string, unknown>[] = [
    {
      $and: [{ claim_status: { $gt: 0 } }, { $or: [{ login_status: 1, approval_status: 0 }, { login_status: 1, approval_status: 1 }, { login_status: 0 }, { login_status: 1, approval_status: 2 }] }],
    },
  ]

  if (search) {
    query.push({
      $or: [
        { full_name: { $regex: search, $options: 'i' } },
        { user_name: { $regex: search, $options: 'i' } },
        { email_id: { $regex: search, $options: 'i' } },
        { referral_user_name: { $regex: search, $options: 'i' } },
      ],
    })
  }

  if (profileScoreRange) {
    const [min, max] = profileScoreRange.split('-').map(Number)
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      query.push({ profile_score: { $gte: min, $lte: max } })
    }
  }

  return query
}

/**
 * $facet-converted version of /admin_created_list's aggregation.
 *
 * CONFIRMED PERF BUG FIX: the real route ran every $lookup (email verification, profile image,
 * work-experience-with-3-nested-lookups) over EVERY matched professional first, THEN called
 * `.skip(skip).limit(limit)` on the aggregate — Mongoose's `.skip()/.limit()` just appends
 * `{$skip}`/`{$limit}` stages to the END of the pipeline, so this was paying the full lookup cost
 * on the whole matched set to return one page. Moving `$match` + `$sort` + `$skip` + `$limit`
 * ahead of the lookups (inside the `$facet`'s `data` branch, same shape as
 * company_admin.list.queries.ts) means the lookups only ever run on the page actually returned.
 * The real route also ran a fully separate `countDocuments` call after the aggregate; folded into
 * the same `$facet` here.
 */
export function buildAdminCreatedListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, unknown>[]; skip: number; limit: number }) {
  return [
    { $match: { $and: matchQuery } },
    { $sort: { _id: -1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_auth_verify_emails', localField: '_id', foreignField: 'user_row_id', as: 'email_info' } },
          { $unwind: { path: '$email_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'userImage' } },
          { $unwind: { path: '$userImage', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_professionals_work_experiences',
              localField: '_id',
              foreignField: 'user_row_id',
              pipeline: [
                { $match: { public_view: true, user_account_type: 1 } },
                {
                  $lookup: {
                    from: 'cln_static_professionals_work_positions',
                    localField: 'position_row_id',
                    foreignField: '_id',
                    as: 'info_position',
                    pipeline: [{ $project: { _id: 1, position_name: 1 } }],
                  },
                },
                { $unwind: { path: '$info_position', preserveNullAndEmptyArrays: true } },
                { $limit: 1 },
                {
                  $lookup: {
                    from: 'cln_company_lists',
                    let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                    as: 'info_company',
                    pipeline: [{ $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }, { $project: { _id: 1, company_name: 1 } }],
                  },
                },
                { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
                {
                  $lookup: {
                    from: 'cln_company_manual_retrievals',
                    let: { company_type: '$company_type', company_row_id: '$company_row_id' },
                    as: 'info_manual_company',
                    pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }, { $project: { _id: 1, company_name: 1 } }],
                  },
                },
                { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
                {
                  $project: {
                    position_name: '$info_position.position_name',
                    company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
                  },
                },
              ],
              as: 'info_work',
            },
          },
          { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
          // Added 2026-09-15 (UX audit): this pipeline was the odd one out among the professionals
          // list pipelines - every sibling (All Professionals, Self-Register Approvals) already
          // resolves `sub_admin_row_id` to a display name via this exact lookup; Admin Created only
          // ever returned the raw numeric id, forcing the "Created by" column to fall back to the
          // professional's own name instead of the real creating sub-admin's name.
          { $lookup: { from: 'cln_sub_admins', localField: 'sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info' } },
          { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              referral_row_id: 1,
              referral_user_name: 1,
              user_name: 1,
              full_name: 1,
              pro_batch: 1,
              gender: 1,
              email_id: 1,
              mobile_number: 1,
              account_visible_type: 1,
              login_status: 1,
              created_date_n_time: 1,
              approval_status: 1,
              claim_status: 1,
              sub_admin_row_id: 1,
              sub_admin_name: '$sub_admin_info.full_name',
              position_name: '$info_work.position_name',
              company_name: '$info_work.company_name',
              email_verify_status: '$email_info.email_verify_status',
              profile_image: '$userImage.profile_image',
              professional_profile_score: 1,
              seo_details_score: 1,
              social_media_score: 1,
              academy_score: 1,
              community_score: 1,
              professional_detail_score: 1,
              investment_score: 1,
              award_score: 1,
              faq_score: 1,
              profile_score: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractAdminCreatedListResult(aggregateOutput: Parameters<typeof extractPaginatedResult>[0]) {
  return extractPaginatedResult(aggregateOutput)
}
