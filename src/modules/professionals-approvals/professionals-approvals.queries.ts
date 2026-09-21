// modules/professionals-approvals/professionals-approvals.queries.ts
// Ported from controllers/admin_panel/app/user_approvals.js (~14-513).
import { PipelineStage } from 'mongoose'
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'
import { joinPositionNamesExpr } from '../funding/funding.queries'

export function buildApprovalsInfoWorkPipeline(): object[] {
  return [
    { $match: { public_view: true, user_account_type: 1 } },
    ...getPositionResolutionStages(),
    { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
    { $limit: 1 },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'info_company',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
          { $project: { _id: 1, company_name: 1 } },
        ],
      },
    },
    { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'info_manual_company',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
          { $limit: 1 },
          { $project: { _id: 1, company_name: 1 } },
        ],
      },
    },
    { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        position_name: '$resolved_position_name',
        company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
      },
    },
  ]
}

interface BuiltFilters {
  matchAnd: object[]
  designationLookingForConditions: object[]
}

export function buildApprovalsFilters(params: {
  approvalStatus: number
  loginStatus: number
  search?: string
  claimStatusRaw?: string
  subAdminRowIdRaw?: string
  profileScoreRange?: string
  designationStatusRaw?: string
  lookingForStatusRaw?: string
}): BuiltFilters {
  const matchAnd: object[] = [{ approval_status: params.approvalStatus, login_status: params.loginStatus }]

  if (params.search) {
    matchAnd.push({
      $and: [{ $or: [{ full_name: { $regex: params.search, $options: 'i' } }, { user_name: { $regex: params.search, $options: 'i' } }, { email_id: { $regex: params.search, $options: 'i' } }] }],
    })
  }
  if (params.claimStatusRaw) matchAnd.push({ claim_status: Number.parseInt(params.claimStatusRaw) })
  if (params.subAdminRowIdRaw) matchAnd.push({ sub_admin_row_id: Number.parseInt(params.subAdminRowIdRaw) })
  if (params.profileScoreRange) {
    const [min, max] = params.profileScoreRange.split('-').map(Number)
    if (!Number.isNaN(min) && !Number.isNaN(max)) matchAnd.push({ profile_score: { $gte: min, $lte: max } })
  }

  const designationLookingForConditions: object[] = []
  const designationStatus = Number.parseInt(params.designationStatusRaw as string)
  if (!Number.isNaN(designationStatus)) {
    if (designationStatus === 1) designationLookingForConditions.push({ designation_info: { $ne: null } })
    else if (designationStatus === 0) designationLookingForConditions.push({ designation_info: null })
  }

  const lookingForStatus = Number.parseInt(params.lookingForStatusRaw as string)
  if (!Number.isNaN(lookingForStatus)) {
    if (lookingForStatus === 1) designationLookingForConditions.push({ $expr: { $gt: [{ $size: { $ifNull: ['$other_info', []] } }, 0] } })
    else if (lookingForStatus === 0) designationLookingForConditions.push({ $expr: { $eq: [{ $size: { $ifNull: ['$other_info', []] } }, 0] } })
  }

  return { matchAnd, designationLookingForConditions }
}

const DESIGNATION_LOOKUP = {
  $lookup: {
    from: 'cln_static_user_designations',
    localField: 'designation_id',
    foreignField: '_id',
    as: 'designation_info',
    pipeline: [{ $match: { active_status: true } }, { $project: { _id: 0, designation_name: 1 } }],
  },
}
const NORMALIZE_DESIGNATION_INFO = { $set: { designation_info: { $cond: [{ $gt: [{ $size: '$designation_info' }, 0] }, '$designation_info', null] } } }
const LOOKING_FOR_LOOKUP = {
  $lookup: {
    from: 'cln_static_user_looking_for_lists',
    localField: 'looking_for_id',
    foreignField: '_id',
    as: 'other_info',
    pipeline: [{ $match: { active_status: true } }, { $project: { _id: 1, name: 1 } }],
  },
}

// CONFIRMED PERF FIX, already applied by a prior engagement (not this session): `$match` runs
// before `$sort` so Mongo can use the {approval_status, login_status, _id} compound index to serve
// the filter and the sort in one pass, instead of sorting the whole collection first. Preserved
// as-is while porting.
export function buildApprovalsListPipeline(matchAnd: object[], designationLookingForConditions: object[]): PipelineStage[] {
  return [
    { $match: { $and: matchAnd } },
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_auth_verify_emails', localField: '_id', foreignField: 'user_row_id', as: 'email_info' } },
    { $unwind: { path: '$email_info', preserveNullAndEmptyArrays: true } },
    { $set: { email_verify_status: '$email_info.email_verify_status' } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'userImage' } },
    { $unwind: { path: '$userImage', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: '_id', foreignField: 'user_row_id', pipeline: buildApprovalsInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    LOOKING_FOR_LOOKUP,
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
    DESIGNATION_LOOKUP,
    NORMALIZE_DESIGNATION_INFO,
    ...(designationLookingForConditions.length ? [{ $match: { $and: designationLookingForConditions } }] : []),
    {
      $project: {
        _id: 1, login_status: 1, approval_status: 1, sub_admin_row_id: 1, claim_status: 1, created_date_n_time: 1,
        full_name: 1, pro_batch: 1, user_name: 1, email_id: 1, mobile_number: 1,
        // Added 2026-09-15: the Rejected tab has no way to show WHY/WHEN a self-registration was
        // rejected even though the schema (`professionalsM.js`) carries exactly this - a real
        // "data exists, admin can't see it" gap found during the UX audit, not a legacy port.
        reason_rejected: 1, rejected_date_n_time: 1,
        position_name: '$info_work.position_name', company_name: '$info_work.company_name',
        email_verify_status: 1, sub_admin_name: '$sub_admin_info.full_name', profile_image: '$userImage.profile_image',
        referral_user_name: 1, professional_profile_score: 1, seo_details_score: 1, social_media_score: 1,
        academy_score: 1, community_score: 1, professional_detail_score: 1, investment_score: 1, award_score: 1,
        faq_score: 1, profile_score: 1, designation_array: '$designation_info.designation_name',
        looking_for_id: '$looking_for_id', looking_for: '$other_info', updated_by: 1, updated_by_row_id: 1,
        updated_date_n_time: 1,
        updated_by_full_name: {
          $switch: {
            branches: [
              { case: { $eq: ['$updated_by', 'user'] }, then: { $let: { vars: { userInfo: { $arrayElemAt: ['$updated_by_user_info', 0] } }, in: { $ifNull: ['$$userInfo.full_name', ''] } } } },
              { case: { $eq: ['$updated_by', 'admin'] }, then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } } },
              { case: { $eq: ['$updated_by', 'subadmin'] }, then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } } },
            ],
            default: '',
          },
        },
      },
    },
  ] as PipelineStage[]
}

export function buildApprovalsCountPipeline(matchAnd: object[], designationLookingForConditions: object[]): PipelineStage[] {
  return [
    { $match: { $and: matchAnd } },
    LOOKING_FOR_LOOKUP,
    DESIGNATION_LOOKUP,
    NORMALIZE_DESIGNATION_INFO,
    ...(designationLookingForConditions.length ? [{ $match: { $and: designationLookingForConditions } }] : []),
    { $count: 'count' },
  ] as PipelineStage[]
}
