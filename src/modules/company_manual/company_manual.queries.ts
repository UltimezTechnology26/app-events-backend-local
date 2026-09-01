// modules/company_manual/company_manual.queries.ts
import type { FilterQuery } from 'mongoose'
import { buildPaginatedFacetStages } from '../common/common.pagination'
import {
  ManualCompanyRecord,
  NewManualCompanyInput,
  CompanyIdOnly,
  ExistenceCheckRow,
  PendingManualCompanyListRow,
  RejectedManualCompanyListRow,
  ApprovedManualCompanyListRow,
  ManualCompanyIndividualDetailRow,
  ManualCompanyEmployeeListRow,
  ManualCompanySponsorPartnerListRow,
  FacetAggregateResult,
} from './company_manual.types'

const companyM = require('../../../models/app/company/companyM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')

type ManualCompanySearchCondition =
  | { $or: Array<{ company_name: { $regex: string; $options: string } } | { company_email_id: { $regex: string; $options: string } } | { website_link: { $regex: string; $options: string } }> }
  | { created_from_type: number }
  | { reject_type: number }

/** Ports the identical search/created_from_type/reject_type match-building logic repeated across pending_list/rejected_list/approved_list (manual_retrievals.js). */
export function buildManualCompanySearchConditions({
  search,
  createdFromType,
  rejectType,
}: {
  search?: string
  createdFromType?: number
  rejectType?: number
}): ManualCompanySearchCondition[] {
  const conditions: ManualCompanySearchCondition[] = []

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
export function buildPendingListPipeline({ matchQuery, skip, limit }: { matchQuery: FilterQuery<ManualCompanyRecord>; skip: number; limit: number }) {
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
export function buildRejectedListPipeline({ matchQuery, skip, limit }: { matchQuery: FilterQuery<ManualCompanyRecord>; skip: number; limit: number }) {
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
export function buildApprovedListPipeline({ matchQuery, skip, limit }: { matchQuery: FilterQuery<ManualCompanyRecord>; skip: number; limit: number }) {
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
 * data.length and counts could drift apart. That count-drift bug is fixed by the $facet
 * conversion itself (both branches now share one upstream match, structurally). The
 * `user_data` filter itself is a SEPARATE, further-confirmed bug (found via live query,
 * 2026-08-25, sign-off given): requiring a real user/manual record to exist silently dropped
 * the employment record whenever that user had since been deleted — verified live, 10 of 688
 * real currently-employed manual-company records (1.5%) were discarded this way, even though
 * legacy's own original pipeline had the same requirement (a pre-existing bug, not a porting
 * artifact — the employment record itself is still real and should show, same reasoning as the
 * sponsor/partner and funding fixes elsewhere in this module/the funding module). Removed.
 */
export function buildManualCompanyEmployeeListPipeline({
  companyRowId,
  companyType,
  skip,
  limit,
}: {
  companyRowId: number
  companyType: 1 | 2
  skip: number
  limit: number
}) {
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
    // CONFIRMED BUG FIX (found live, 2026-09-01): this was hardcoded to `company_type: 2`
    // (manual) - same class of bug as the sponsor/partner tab. Approval (`app_helper.js`'s
    // "shift data from manual to register user") migrates every professionals_work_experience
    // row referencing the manual company to `company_type: 1` with `company_row_id` now holding
    // the NEW real company's id, so this tab went permanently blank for any approved company
    // that had team members. `companyType` is threaded in by the caller (1 once approved, 2
    // while still pending/rejected), same reasoning as the sponsor/partner fix.
    { $match: { company_type: companyType, company_row_id: companyRowId, till_date_status: 2 } },
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
 *
 * CONFIRMED BUG FIX (found via live read-only query against production, 2026-08-25): matching
 * on `user_company_row_id` alone silently misses every sponsor/partner row written before that
 * field existed. Verified live: of 66 real account_type:2/registered_type:2 rows, 5 have no
 * `user_company_row_id` at all — they carry the manual company's row id in the older
 * `sponsor_partner_row_id` field instead (the model file's own comments call this field "not
 * used", but production data written before the newer field was introduced still relies on it;
 * 4 of the 5 confirmed to resolve to a real, still-existing manual company via that field). Fixed
 * by matching either field, so a manual company's Sponsor/Partner tab shows its full history
 * regardless of which write-path era created the record — not just its newest appearances.
 */
// CONFIRMED BUG FIX (found via live query, 2026-09-01): the stored `sponsorship_type_title` is
// NOT reliably populated at write time — `sponsors_n_partners.js`'s create route stores the raw
// client-sent title (often never sent at all; live data confirmed it blank on both sponsor AND
// partner rows) alongside a `category_row_id`, but never denormalizes a name from it. The row's
// `category_row_id` IS reliably present (confirmed live: 3 of 3 sample rows), and is exactly what
// the SAME file's own single-row/list-building functions already resolve via a lookup against
// `cln_static_event_sponsor_categories` (`sponsorship_name`) / `cln_static_event_partner_categories`
// (`partnership_name`) - see lines ~632-688 there. Reusing that same lookup here fixes the type
// column for every existing row retroactively, not just ones created after any write-path fix.
const SPONSOR_PARTNER_CATEGORY_LOOKUP: Record<1 | 2, { from: string; nameField: string }> = {
  1: { from: 'cln_static_event_sponsor_categories', nameField: 'sponsorship_name' },
  2: { from: 'cln_static_event_partner_categories', nameField: 'partnership_name' },
}

function buildManualCompanySponsorOrPartnerListPipeline({
  companyRowId,
  sponsorPartnerType,
  registeredType,
  skip,
  limit,
}: {
  companyRowId: number
  sponsorPartnerType: 1 | 2
  registeredType: 1 | 2
  skip: number
  limit: number
}) {
  const { from: categoryCollection, nameField: categoryNameField } = SPONSOR_PARTNER_CATEGORY_LOOKUP[sponsorPartnerType]
  return [
    {
      $match: {
        account_type: 2,
        // CONFIRMED BUG FIX (found live, 2026-09-01): this was hardcoded to `registered_type: 2`
        // (manual), so once an admin approved a manual company that had sponsor/partner history,
        // this tab went permanently blank for it. Approval (`app_helper.js`'s "shift data from
        // manual to register user") migrates every cln_event_sponsor_partner_details row that
        // referenced the manual company to `registered_type: 1` with `user_company_row_id` now
        // holding the NEW real company's id - the View modal already resolves `companyRowId` to
        // that new id post-approval (`main_company_row_id`), but this query kept demanding the
        // now-stale `registered_type: 2`, which no row matching that id could ever satisfy again.
        // `registeredType` is threaded in by the caller (1 once approved, 2 while still pending/
        // rejected) rather than matching both values unconditionally, since `company_manual_
        // retrievalsM._id` and `companyM._id` are independent counters that can collide - matching
        // only the type the caller actually knows this id belongs to avoids pulling in an unrelated
        // company's rows that happen to share the same numeric id in the other collection.
        registered_type: registeredType,
        sponsor_partner_type: sponsorPartnerType,
        $or: [{ user_company_row_id: companyRowId }, { sponsor_partner_row_id: companyRowId }],
      },
    },
    { $sort: { _id: -1 } },
    EVENT_LOOKUP_FOR_SPONSOR_PARTNER,
    // CONFIRMED BUG FIX (found via live query, 2026-08-25): the removed `{ $match: { event_info:
    // { $exists: true } } }` stage silently dropped the row whenever its event no longer existed
    // (deleted/purged) — verified live: 14 of 66 real manual-company sponsor/partner assignments
    // (21%) reference an event_row_id with no matching `cln_events` document, and every one of
    // them was being discarded here even though the sponsor/partner assignment itself is a valid,
    // real record. The assignment should still show (the $project below already degrades
    // gracefully — every `$event_info.*` field is simply absent when the event is missing); only
    // the lookup's own `$unwind`+`preserveNullAndEmptyArrays: true` is needed to keep the shape
    // consistent when there's no match.
    { $unwind: { path: '$event_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: categoryCollection,
        localField: 'category_row_id',
        foreignField: '_id',
        as: 'category_info',
        pipeline: [{ $project: { [categoryNameField]: 1 } }],
      },
    },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        event_row_id: 1,
        event_title: '$event_info.event_title',
        event_image: '$event_info.event_image',
        event_url: '$event_info.event_url',
        start_date: '$event_info.start_date',
        end_date: '$event_info.end_date',
        // Prefer the live category lookup (authoritative, self-healing if the raw field was ever
        // blank) - only fall back to the raw stored field if the category itself was deleted.
        sponsorship_type_title: { $ifNull: [`$category_info.${categoryNameField}`, '$sponsorship_type_title'] },
        requested_status: 1,
        created_date_n_time: 1,
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

export function buildManualCompanySponsorListPipeline({
  companyRowId,
  registeredType,
  skip,
  limit,
}: {
  companyRowId: number
  registeredType: 1 | 2
  skip: number
  limit: number
}) {
  return buildManualCompanySponsorOrPartnerListPipeline({ companyRowId, sponsorPartnerType: 1, registeredType, skip, limit })
}

export function buildManualCompanyPartnerListPipeline({
  companyRowId,
  registeredType,
  skip,
  limit,
}: {
  companyRowId: number
  registeredType: 1 | 2
  skip: number
  limit: number
}) {
  return buildManualCompanySponsorOrPartnerListPipeline({ companyRowId, sponsorPartnerType: 2, registeredType, skip, limit })
}

// ─── Uniqueness lookups (addManualCompanyDetails) ────────────────────────────

export async function findCompanyByName(company_name: string): Promise<CompanyIdOnly | null> {
  return companyM.findOne({ company_name }).collation({ locale: 'en', strength: 2 })
}

export async function findManualCompanyByName(company_name: string): Promise<ManualCompanyRecord | null> {
  return company_manual_retrievalsM.findOne({ company_name }).collation({ locale: 'en', strength: 2 })
}

export async function findCompanyByEmail(company_email_id: string): Promise<CompanyIdOnly | null> {
  return companyM.findOne({ company_email_id }).collation({ locale: 'en', strength: 2 })
}

export async function findManualCompanyByEmail(company_email_id: string): Promise<ManualCompanyRecord | null> {
  return company_manual_retrievalsM.findOne({ company_email_id }).collation({ locale: 'en', strength: 2 })
}

export async function findCompanyByWebsiteLink(website_link: string): Promise<CompanyIdOnly | null> {
  return companyM.findOne({ website_link }).collation({ locale: 'en', strength: 2 })
}

export async function findManualCompanyByWebsiteLink(website_link: string): Promise<ManualCompanyRecord | null> {
  return company_manual_retrievalsM.findOne({ website_link }).collation({ locale: 'en', strength: 2 })
}

// ─── Create / read / update / delete on company_manual_retrievalsM ──────────

export async function createManualCompany(input: NewManualCompanyInput): Promise<ManualCompanyRecord> {
  return new company_manual_retrievalsM(input).save()
}

export async function findManualCompanyById(company_row_id: number): Promise<ManualCompanyRecord | null> {
  return company_manual_retrievalsM.findOne({ _id: company_row_id })
}

export async function updateManualCompanyLogo(company_row_id: number, company_logo: string): Promise<void> {
  await company_manual_retrievalsM.updateOne({ _id: company_row_id }, { $set: { company_logo } })
}

export async function findPendingManualCompanyById(company_row_id: number): Promise<ManualCompanyRecord | null> {
  return company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: 0 })
}

export interface RejectManualCompanyUpdateFields {
  approval_date: Date
  reject_type?: number
  reject_reason?: string
  approval_sub_admin_row_id?: number
}

export async function rejectManualCompanyRecord(company_row_id: number, fields: RejectManualCompanyUpdateFields): Promise<void> {
  await company_manual_retrievalsM.updateOne(
    { _id: company_row_id },
    { $set: { approval_status: 2, approval_date: fields.approval_date, reject_type: fields.reject_type, approval_sub_admin_row_id: fields.approval_sub_admin_row_id, reject_reason: fields.reject_reason } },
  )
}

export async function findRejectedManualCompanyById(company_row_id: number): Promise<ManualCompanyRecord | null> {
  return company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: 2 })
}

export async function revokeManualCompanyRecord(company_row_id: number): Promise<void> {
  await company_manual_retrievalsM.updateOne({ _id: company_row_id, approval_status: 2 }, { $set: { approval_status: 0 } })
}

export async function findManualCompanyForDeletion(company_row_id: number): Promise<ManualCompanyRecord | null> {
  return company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: { $in: [0, 2] } })
}

export async function deleteManualCompanyRecord(company_row_id: number): Promise<void> {
  await company_manual_retrievalsM.deleteOne({ _id: company_row_id })
}

// ─── Cross-collection existence checks (deleteManualCompany cleanup) ────────

export async function findFundsInvestedForManualCompany(company_row_id: number): Promise<ExistenceCheckRow | null> {
  return fundingInvestmentM.findOne({ investor_type: 2, investor_registered_type: 2, investor_row_id: company_row_id })
}

export async function findFundsRaisedForManualCompany(company_row_id: number): Promise<ExistenceCheckRow | null> {
  return fundingInvestmentM.findOne({ investor_type: 2, funds_raised_registered_type: 2, funds_raised_company_row_id: company_row_id })
}

export async function findUserFundsRaisedForManualCompany(company_row_id: number): Promise<ExistenceCheckRow | null> {
  return fundingInvestmentM.findOne({ investor_type: 1, funds_raised_registered_type: 2, funds_raised_company_row_id: company_row_id })
}

export async function findSponsorPartnerForManualCompany(company_row_id: number): Promise<ExistenceCheckRow | null> {
  return event_sponsors_partner_detailsM.findOne({ account_type: 2, registered_type: 2, user_company_row_id: company_row_id })
}

export async function findWorkExperienceForManualCompany(company_row_id: number): Promise<ExistenceCheckRow | null> {
  return professionals_work_experienceM.findOne({ company_type: 2, company_row_id: company_row_id })
}

// ─── Aggregate runners ────────────────────────────────────────────────────

export async function aggregatePendingManualCompanies({
  matchQuery,
  skip,
  limit,
}: {
  matchQuery: FilterQuery<ManualCompanyRecord>
  skip: number
  limit: number
}): Promise<FacetAggregateResult<PendingManualCompanyListRow>[]> {
  return company_manual_retrievalsM.aggregate(buildPendingListPipeline({ matchQuery, skip, limit }))
}

export async function aggregateRejectedManualCompanies({
  matchQuery,
  skip,
  limit,
}: {
  matchQuery: FilterQuery<ManualCompanyRecord>
  skip: number
  limit: number
}): Promise<FacetAggregateResult<RejectedManualCompanyListRow>[]> {
  return company_manual_retrievalsM.aggregate(buildRejectedListPipeline({ matchQuery, skip, limit }))
}

export async function aggregateApprovedManualCompanies({
  matchQuery,
  skip,
  limit,
}: {
  matchQuery: FilterQuery<ManualCompanyRecord>
  skip: number
  limit: number
}): Promise<FacetAggregateResult<ApprovedManualCompanyListRow>[]> {
  return company_manual_retrievalsM.aggregate(buildApprovedListPipeline({ matchQuery, skip, limit }))
}

export async function aggregateManualCompanyIndividualDetail(companyRowId: number): Promise<ManualCompanyIndividualDetailRow[]> {
  return company_manual_retrievalsM.aggregate(buildIndividualDetailPipeline(companyRowId))
}

export async function aggregateManualCompanyEmployeeList({
  companyRowId,
  companyType,
  skip,
  limit,
}: {
  companyRowId: number
  companyType: 1 | 2
  skip: number
  limit: number
}): Promise<FacetAggregateResult<ManualCompanyEmployeeListRow>[]> {
  return professionals_work_experienceM.aggregate(buildManualCompanyEmployeeListPipeline({ companyRowId, companyType, skip, limit }))
}

export async function aggregateManualCompanySponsorList({
  companyRowId,
  registeredType,
  skip,
  limit,
}: {
  companyRowId: number
  registeredType: 1 | 2
  skip: number
  limit: number
}): Promise<FacetAggregateResult<ManualCompanySponsorPartnerListRow>[]> {
  return event_sponsors_partner_detailsM.aggregate(buildManualCompanySponsorListPipeline({ companyRowId, registeredType, skip, limit }))
}

export async function aggregateManualCompanyPartnerList({
  companyRowId,
  registeredType,
  skip,
  limit,
}: {
  companyRowId: number
  registeredType: 1 | 2
  skip: number
  limit: number
}): Promise<FacetAggregateResult<ManualCompanySponsorPartnerListRow>[]> {
  return event_sponsors_partner_detailsM.aggregate(buildManualCompanyPartnerListPipeline({ companyRowId, registeredType, skip, limit }))
}
