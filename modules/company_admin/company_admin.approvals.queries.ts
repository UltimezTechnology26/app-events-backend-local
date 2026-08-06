// modules/company_admin/company_admin.approvals.queries.ts
import { buildPaginatedFacetStages, extractPaginatedResult } from '../common/common.pagination'

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

/** Ports company_approvals.js's approval_status/active_status $and filter (lines 35-70). */
export function buildCompaniesListMatchQuery({
  approvalStatus,
  activeStatus,
  search,
  profileScoreRange,
}: {
  approvalStatus: number
  activeStatus: number
  search?: string
  profileScoreRange?: string
}) {
  const statusApply = approvalStatus === 1 ? { approval_status: approvalStatus } : { approval_status: approvalStatus, active_status: activeStatus }
  const and: any[] = [statusApply]

  if (search) {
    and.push({ $or: [{ company_name: { $regex: search, $options: 'i' } }, { company_id: { $regex: search, $options: 'i' } }, { company_email_id: { $regex: search, $options: 'i' } }] })
  }

  const ranges: Record<string, [number, number]> = {
    '0-24': [0, 24],
    '25-49': [25, 49],
    '50-74': [50, 74],
    '75-100': [75, 100],
  }
  if (profileScoreRange && ranges[profileScoreRange]) {
    const [gte, lte] = ranges[profileScoreRange]
    and.push({ profile_score: { $gte: gte, $lte: lte } })
  }

  return { $and: and }
}

/** Ports company_approvals.js's GET /companies_list/:approval_status/:active_status/:skip/:limit (lines 24-317), $facet-converted per the standing list+count fix. */
export function buildCompaniesListPipeline({ matchQuery, categoryStatus, skip, limit }: { matchQuery: any; categoryStatus?: number; skip: number; limit: number }) {
  return [
    { $match: matchQuery },
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
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
    { $lookup: { from: 'cln_company_added_to_partners', localField: '_id', foreignField: 'company_row_id', as: 'partner' } },
    { $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
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
    {
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
        sub_admin_row_id: 1,
        claim_status: 1,
        created_user_name: '$user_info.full_name',
        partner_added_id: '$partner._id',
        sub_admin_name: '$sub_admin_info.full_name',
        sub_admin_username: '$sub_admin_info.user_name',
        business_name: '$business_info.business_name',
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
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

export function extractCompaniesListResult(aggregateOutput: any[]) {
  return extractPaginatedResult(aggregateOutput)
}

/** Ports company_approvals.js's GET /deleted_list/:skip/:limit (lines 532-602), $facet-converted per the standing list+count fix. */
export function buildDeletedListPipeline({ matchQuery, skip, limit }: { matchQuery: any; skip: number; limit: number }) {
  return [
    { $sort: { _id: -1 } },
    { $match: matchQuery },
    { $lookup: { from: 'cln_static_company_business_models', localField: 'business_model_id', foreignField: '_id', as: 'business_info', pipeline: [{ $project: { business_name: 1 } }] } },
    { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'main_business_info', pipeline: [{ $project: { business_name: 1 } }] } },
    { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        company_name: 1,
        company_id: 1,
        company_email_id: 1,
        company_logo: 1,
        website_link: 1,
        contact_number: 1,
        established_in: 1,
        country_id: 1,
        company_location: 1,
        describe_in_one_line: 1,
        date_n_time: 1,
        approval_status: 1,
        main_business_model_name: '$main_business_info.business_name',
        business_name: '$business_info.business_name',
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

export function extractDeletedListResult(aggregateOutput: any[]) {
  return extractPaginatedResult(aggregateOutput)
}

export function buildDeletedListMatchQuery(search?: string) {
  if (!search) {
    return {}
  }
  return { $or: [{ company_name: { $regex: search, $options: 'i' } }, { company_id: { $regex: search, $options: 'i' } }, { company_email_id: { $regex: search, $options: 'i' } }] }
}
