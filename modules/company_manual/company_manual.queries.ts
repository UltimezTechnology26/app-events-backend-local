// modules/company_manual/company_manual.queries.ts
import { buildPaginatedFacetStages } from '../common/common.pagination'

/** Ports the identical search/created_from_type/reject_type match-building logic repeated across pending_list/rejected_list/approved_list (manual_retrievals.js). */
export function buildManualCompanySearchConditions({
  search,
  createdFromType,
  rejectType,
}: {
  search?: string
  createdFromType?: number
  rejectType?: number
}): Record<string, any>[] {
  const conditions: Record<string, any>[] = []

  if (search) {
    conditions.push({
      $or: [
        { company_name: { $regex: search, $options: 'i' } },
        { company_email_id: { $regex: search, $options: 'i' } },
        { website_link: { $regex: search, $options: 'i' } },
      ],
    })
  }

  if (createdFromType !== undefined && [1, 2, 3].includes(createdFromType)) {
    conditions.push({ created_from_type: createdFromType })
  }

  if (rejectType !== undefined && !Number.isNaN(rejectType)) {
    conditions.push({ reject_type: rejectType })
  }

  return conditions
}

const SUBADMIN_LOOKUP = {
  $lookup: {
    from: 'cln_sub_admins',
    localField: 'sub_admin_row_id',
    foreignField: '_id',
    as: 'info_subadmin',
    pipeline: [{ $project: { full_name: 1 } }],
  },
}
const UNWIND_SUBADMIN = { $unwind: { path: '$info_subadmin', preserveNullAndEmptyArrays: true } }

/**
 * Ports manual_retrievals.js's GET /pending_list/:skip/:limit (lines 17-74), $facet-converted
 * per the standing list+count fix. Stage order (sort before match) preserved exactly as the
 * real source has it — not reordered, since that wasn't part of the confirmed-bug scope here.
 */
export function buildPendingListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, any>; skip: number; limit: number }) {
  return [
    { $sort: { _id: -1 } },
    { $match: matchQuery },
    {
      $project: {
        _id: 1,
        company_name: 1,
        company_email_id: 1,
        company_logo: 1,
        website_link: 1,
        used_counts: 1,
        used_types: 1,
        created_on: 1,
        created_from_type: 1,
        updated_on: 1,
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

/** Ports manual_retrievals.js's GET /rejected_list/:skip/:limit (lines 76-163), $facet-converted. */
export function buildRejectedListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, any>; skip: number; limit: number }) {
  return [
    { $sort: { _id: -1 } },
    { $match: matchQuery },
    SUBADMIN_LOOKUP,
    UNWIND_SUBADMIN,
    {
      $project: {
        _id: 1,
        company_name: 1,
        company_email_id: 1,
        company_logo: 1,
        website_link: 1,
        used_counts: 1,
        used_types: 1,
        created_on: 1,
        updated_on: 1,
        created_from_type: 1,
        approval_status: 1,
        approval_date: 1,
        approval_sub_admin_row_id: 1,
        reject_type: 1,
        reject_reason: 1,
        subadmin_name: '$info_subadmin.full_name',
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

/** Ports manual_retrievals.js's GET /approved_list/:skip/:limit (lines 166-271), $facet-converted. */
export function buildApprovedListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, any>; skip: number; limit: number }) {
  return [
    { $sort: { _id: -1 } },
    { $match: matchQuery },
    SUBADMIN_LOOKUP,
    UNWIND_SUBADMIN,
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'main_company_row_id',
        foreignField: '_id',
        as: 'info_main_company',
        pipeline: [{ $project: { company_name: 1, company_id: 1, active_status: 1 } }],
      },
    },
    { $unwind: { path: '$info_main_company', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        company_name: 1,
        company_email_id: 1,
        company_logo: 1,
        website_link: 1,
        used_counts: 1,
        used_types: 1,
        created_on: 1,
        updated_on: 1,
        approval_status: 1,
        approval_date: 1,
        approval_sub_admin_row_id: 1,
        reject_type: 1,
        reject_reason: 1,
        created_from_type: 1,
        main_company_row_id: 1,
        subadmin_name: '$info_subadmin.full_name',
        main_company_name: '$info_main_company.company_name',
        main_company_id: '$info_main_company.company_id',
        main_company_active_status: '$info_main_company.active_status',
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

/**
 * Ports manual_retrievals.js's GET /individual_detail/:company_row_id (lines 275-757) verbatim —
 * the fund-raised/fund-invested/team-members sub-pipelines resolving investor/user identity
 * across the registered-vs-manual split are unchanged from source.
 */
export function buildIndividualDetailPipeline(companyRowId: number) {
  return [
    { $match: { _id: companyRowId } },
    SUBADMIN_LOOKUP,
    UNWIND_SUBADMIN,
    {
      $lookup: {
        from: 'cln_funding_investment_lists',
        localField: '_id',
        foreignField: 'funds_raised_company_row_id',
        as: 'fund_raised_count',
        pipeline: [
          {
            $lookup: {
              from: 'cln_professionals',
              let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
              as: 'user_info',
              pipeline: [
                {
                  $match: {
                    $and: [
                      { $expr: { $and: [{ $eq: [1, '$$investor_type'] }, { $eq: [1, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } },
                      { login_status: 1 },
                    ],
                  },
                },
                { $project: { _id: 1 } },
              ],
            },
          },
          { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_professionals_manual_retrievals',
              let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
              as: 'user_manual_info',
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: [1, '$$investor_type'] }, { $eq: [2, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } } },
                { $project: { _id: 1 } },
              ],
            },
          },
          { $unwind: { path: '$user_manual_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_lists',
              let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
              as: 'company_info',
              pipeline: [
                {
                  $match: {
                    $and: [
                      { $expr: { $and: [{ $eq: [2, '$$investor_type'] }, { $eq: [1, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } },
                      { active_status: 1 },
                    ],
                  },
                },
                { $project: { _id: 1 } },
              ],
            },
          },
          { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_manual_retrievals',
              let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
              as: 'company_manual_info',
              pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$investor_type'] }, { $eq: [2, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } } }],
            },
          },
          { $unwind: { path: '$company_manual_info', preserveNullAndEmptyArrays: true } },
          {
            $set: {
              investor_data: {
                $switch: {
                  branches: [
                    { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$user_info' },
                    { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$user_manual_info' },
                    { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$company_info' },
                    { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$company_manual_info' },
                  ],
                  default: '',
                },
              },
            },
          },
          { $match: { investor_data: { $nin: ['', null] }, funds_raised_registered_type: 2 } },
        ],
      },
    },
    {
      $lookup: {
        from: 'cln_funding_investment_lists',
        localField: '_id',
        foreignField: 'investor_row_id',
        as: 'fund_invested_count',
        pipeline: [
          {
            $lookup: {
              from: 'cln_company_lists',
              let: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' },
              as: 'company_info',
              pipeline: [
                {
                  $match: {
                    $and: [{ $expr: { $and: [{ $eq: [1, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } }, { active_status: 1 }],
                  },
                },
                { $project: { _id: 1 } },
              ],
            },
          },
          { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_manual_retrievals',
              let: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' },
              as: 'manual_info',
              pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } } }],
            },
          },
          { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
          { $set: { company_data: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: '$company_info', else: '$manual_info' } } } },
          { $match: { company_data: { $nin: ['', null] }, investor_type: 2, investor_registered_type: 2 } },
        ],
      },
    },
    {
      $lookup: {
        from: 'cln_professionals_work_experiences',
        localField: '_id',
        foreignField: 'company_row_id',
        as: 'team_members_count',
        pipeline: [
          {
            $lookup: {
              from: 'cln_professionals',
              let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
              as: 'user_info',
              pipeline: [
                { $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } }, { login_status: 1 }] } },
                { $project: { _id: 1 } },
              ],
            },
          },
          { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_professionals_manual_retrievals',
              let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
              as: 'manual_info',
              pipeline: [
                { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
                { $project: { _id: 1 } },
              ],
            },
          },
          { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
          {
            $set: {
              user_data: {
                $switch: {
                  branches: [
                    { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
                    { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' },
                  ],
                  default: '',
                },
              },
            },
          },
          { $match: { user_data: { $exists: true, $ne: '' }, company_type: 2, company_row_id: companyRowId, till_date_status: 2 } },
        ],
      },
    },
    {
      $set: {
        fund_raised_count: { $size: '$fund_raised_count' },
        fund_invested_count: { $size: '$fund_invested_count' },
        team_members_count: { $size: '$team_members_count' },
      },
    },
    {
      $project: {
        _id: 1,
        company_name: 1,
        company_email_id: 1,
        company_logo: 1,
        website_link: 1,
        used_counts: 1,
        used_types: 1,
        created_on: 1,
        updated_on: 1,
        approval_status: 1,
        approval_date: 1,
        approval_sub_admin_row_id: 1,
        reject_type: 1,
        reject_reason: 1,
        subadmin_name: '$info_subadmin.full_name',
        fund_raised_count: 1,
        fund_invested_count: 1,
        team_members_count: 1,
      },
    },
  ]
}

const USER_ACCOUNT_LOOKUP_AND_SWITCH = [
  {
    $lookup: {
      from: 'cln_professionals',
      let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
      as: 'user_info',
      pipeline: [
        { $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } }, { login_status: 1 }] } },
        { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
        { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, approval_status: 1, profile_image: '$img_info.profile_image' } },
      ],
    },
  },
  { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: 'cln_professionals_manual_retrievals',
      let: { user_row_id: '$user_row_id', user_account_type: '$user_account_type' },
      as: 'manual_info',
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: [2, '$$user_account_type'] }, { $eq: ['$_id', '$$user_row_id'] }] } } },
        { $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } },
      ],
    },
  },
  { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
  {
    $set: {
      user_data: {
        $switch: {
          branches: [
            { case: { $and: [{ $eq: ['$user_account_type', 1] }] }, then: '$user_info' },
            { case: { $and: [{ $eq: ['$user_account_type', 2] }] }, then: '$manual_info' },
          ],
          default: '',
        },
      },
    },
  },
]

/**
 * Ports manual_retrievals.js's GET /manual_company_employee_list/:company_row_id/:skip/:limit
 * (lines 864-1193), $facet-converted per the standing list+count fix. The real source ran two
 * separately-hand-typed ~180-line pipelines whose final $match subtly disagreed — the data
 * pipeline required `user_data: {$exists:true, $ne:""}` while the count pipeline only checked
 * `user_data: {$ne:""}` (which also matches a MISSING field, since undefined !== ""), meaning
 * data.length and counts could drift apart. Consolidated onto the stricter (data pipeline's)
 * condition — a real user/manual record must actually be present — since $facet forces both
 * branches to share one upstream match, this class of drift is now structurally impossible.
 */
export function buildManualCompanyEmployeeListPipeline({ companyRowId, skip, limit }: { companyRowId: number; skip: number; limit: number }) {
  return [
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
    ...USER_ACCOUNT_LOOKUP_AND_SWITCH,
    { $match: { user_data: { $exists: true, $ne: '' }, company_type: 2, company_row_id: companyRowId, till_date_status: 2 } },
    {
      $project: {
        _id: 1,
        user_account_type: 1,
        user_row_id: 1,
        position_row_id: 1,
        position_name: '$info_position.position_name',
        user_name: '$user_data.user_name',
        full_name: '$user_data.full_name',
        email_id: '$user_data.email_id',
        profile_image: '$user_data.profile_image',
        user_approval_status: '$user_data.approval_status',
        verified_status: 1,
        verified_on: 1,
        employment_type: 1,
        location_type: 1,
        start_date: 1,
        responsibilities: 1,
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

const EVENT_LOOKUP_FOR_SPONSOR_PARTNER = {
  $lookup: {
    from: 'cln_events',
    localField: 'event_row_id',
    foreignField: '_id',
    as: 'event_info',
    pipeline: [{ $project: { _id: 1, event_title: 1, event_image: 1, event_url: 1, start_date: 1, end_date: 1 } }],
  },
}

/**
 * Shared by buildManualCompanySponsorListPipeline/buildManualCompanyPartnerListPipeline —
 * a manual company's appearances in cln_event_sponsor_partner_details, distinguished only by
 * sponsor_partner_type (1: Sponsor, 2: Partner). No prior list version of this existed for
 * manual companies (only a registered-company COUNT aggregation existed, in modules/partners) —
 * built fresh here following this module's own manual_company_employee_list pattern
 * ($facet-paginated, admin-auth-gated) rather than the funding module's separate one, since
 * these are the same kind of "this manual company's cross-references" concern as Team Members.
 */
function buildManualCompanySponsorOrPartnerListPipeline({
  companyRowId,
  sponsorPartnerType,
  skip,
  limit,
}: {
  companyRowId: number
  sponsorPartnerType: 1 | 2
  skip: number
  limit: number
}) {
  return [
    { $match: { user_company_row_id: companyRowId, account_type: 2, registered_type: 2, sponsor_partner_type: sponsorPartnerType } },
    { $sort: { _id: -1 } },
    EVENT_LOOKUP_FOR_SPONSOR_PARTNER,
    { $unwind: { path: '$event_info', preserveNullAndEmptyArrays: true } },
    { $match: { event_info: { $exists: true } } },
    {
      $project: {
        _id: 1,
        event_row_id: 1,
        event_title: '$event_info.event_title',
        event_image: '$event_info.event_image',
        event_url: '$event_info.event_url',
        start_date: '$event_info.start_date',
        end_date: '$event_info.end_date',
        sponsorship_type_title: 1,
        requested_status: 1,
        created_date_n_time: 1,
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

export function buildManualCompanySponsorListPipeline({ companyRowId, skip, limit }: { companyRowId: number; skip: number; limit: number }) {
  return buildManualCompanySponsorOrPartnerListPipeline({ companyRowId, sponsorPartnerType: 1, skip, limit })
}

export function buildManualCompanyPartnerListPipeline({ companyRowId, skip, limit }: { companyRowId: number; skip: number; limit: number }) {
  return buildManualCompanySponsorOrPartnerListPipeline({ companyRowId, sponsorPartnerType: 2, skip, limit })
}
