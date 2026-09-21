// modules/professionals-manual-retrievals/professionals-manual-retrievals.queries.ts
// Ported from controllers/admin_panel/app/user/manual_users.js (~20-378, ~381-1017).
import { PipelineStage } from 'mongoose'
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'
import { joinPositionNamesExpr } from '../funding/funding.queries'

// CONFIRMED DEDUP (no behavior change): legacy's buildPendingListInfoWorkPipeline,
// buildRejectedListInfoWorkPipeline, and buildIndividualDetailInfoWorkPipeline (all three
// user_account_type: 2) were three separately-named, byte-for-byte-identical ~80-line functions
// — legacy's own doc comments explicitly acknowledge this ("kept as its own function per this
// batch's established extraction convention, not merged even though the body is presently
// identical"). buildApprovedListInfoWorkPipeline differs by exactly one value
// (user_account_type: 1). Consolidated into one parameterized function.
// Kept as `object[]` (not `PipelineStage[]`) deliberately - this pipeline is only ever embedded as
// a `$lookup.pipeline` value, whose narrower sub-pipeline stage type rejects top-level-only stages
// like `PipelineStage.Merge`/`Out` that the general `PipelineStage` union includes; `object[]`
// keeps every call site (each already cast `as PipelineStage[]` at its own top level) unblocked.
export function buildManualUserInfoWorkPipeline(userAccountType: 1 | 2): object[] {
  return [
    { $match: { public_view: true, user_account_type: userAccountType } },
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
          { $project: { _id: 1, company_name: 1, company_email_id: 1 } },
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
          { $project: { _id: 1, company_name: 1, company_email_id: 1 } },
        ],
      },
    },
    { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        position_name: '$resolved_position_name',
        company_email_id: { $cond: { if: '$info_company.company_email_id', then: '$info_company.company_email_id', else: '$info_manual_company.company_email_id' } },
        company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
      },
    },
  ] as PipelineStage[]
}

function buildMatchQuery(baseConditions: object[], search: string | undefined): { $and: object[] } {
  const query = [...baseConditions]
  if (search) {
    query.push({ $or: [{ full_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] })
  }
  return { $and: query }
}

export function buildPendingListPipeline(matchQuery: object): PipelineStage[] {
  return [
    { $sort: { _id: -1 } },
    { $match: matchQuery },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: '_id', foreignField: 'user_row_id', pipeline: buildManualUserInfoWorkPipeline(2) as any, as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, gender: 1, full_name: 1, email_id: 1, mobile_number: 1, profile_image: 1, work_position: 1,
        user_link: 1, created_on: 1, updated_on: 1, used_counts: 1, used_types: 1,
        position_name: '$info_work.position_name', company_email_id: '$info_work.company_email_id', company_name: '$info_work.company_name',
      },
    },
  ]
}

export function buildPendingListMatchQuery(search?: string) {
  return buildMatchQuery([{ approval_status: 0 }], search)
}

export function buildRejectedListMatchQuery(search?: string, rejectType?: number) {
  const base: object[] = [{ approval_status: 2 }]
  if (rejectType !== undefined && !Number.isNaN(rejectType)) base.push({ reject_type: rejectType })
  return buildMatchQuery(base, search)
}

export function buildApprovedListMatchQuery(search?: string) {
  return buildMatchQuery([{ approval_status: { $in: [1, 3] } }], search)
}

const SUB_ADMIN_LOOKUP = {
  $lookup: {
    from: 'cln_sub_admins',
    localField: 'approval_sub_admin_row_id',
    foreignField: '_id',
    as: 'info_subadmin',
    pipeline: [{ $project: { full_name: 1 } }],
  },
}

const REVIEWED_LIST_PROJECT = {
  $project: {
    _id: 1, gender: 1, full_name: 1, email_id: 1, mobile_number: 1, profile_image: 1, work_position: 1,
    user_link: 1, created_on: 1, updated_on: 1, used_counts: 1, used_types: 1, approval_date: 1,
    approval_sub_admin_row_id: 1, reject_type: 1, rejected_reason: 1,
    position_name: '$info_work.position_name', company_email_id: '$info_work.company_email_id', company_name: '$info_work.company_name',
    subadmin_name: '$info_subadmin.full_name',
  },
}

export function buildRejectedListPipeline(matchQuery: object): PipelineStage[] {
  return [
    { $sort: { _id: -1 } },
    { $match: matchQuery },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: '_id', foreignField: 'user_row_id', pipeline: buildManualUserInfoWorkPipeline(2) as any, as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    SUB_ADMIN_LOOKUP,
    { $unwind: { path: '$info_subadmin', preserveNullAndEmptyArrays: true } },
    REVIEWED_LIST_PROJECT,
  ]
}

export function buildApprovedListPipeline(matchQuery: object): PipelineStage[] {
  return [
    { $sort: { _id: -1 } },
    { $match: matchQuery },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: 'main_user_row_id', foreignField: 'user_row_id', pipeline: buildManualUserInfoWorkPipeline(1) as any, as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    SUB_ADMIN_LOOKUP,
    { $unwind: { path: '$info_subadmin', preserveNullAndEmptyArrays: true } },
    REVIEWED_LIST_PROJECT,
  ]
}

export function buildIndividualDetailPipeline(userRowId: number): PipelineStage[] {
  return [
    { $match: { _id: userRowId } },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: '_id', foreignField: 'user_row_id', pipeline: buildManualUserInfoWorkPipeline(2) as any, as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    SUB_ADMIN_LOOKUP,
    { $unwind: { path: '$info_subadmin', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'info_company',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
          { $project: { company_name: 1, company_id: 1, company_email_id: 1, company_logo: 1, active_status: 1 } },
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
          { $project: { company_name: 1, company_email_id: 1, company_logo: 1, approval_status: 1 } },
        ],
      },
    },
    { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_events_speakers',
        let: { user_row_id: '$_id' },
        as: 'speakers_count',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$user_type', 2] }, { $eq: ['$user_row_id', '$$user_row_id'] }] } } }, { $project: { _id: 1 } }],
      },
    },
    {
      $lookup: {
        from: 'cln_professionals_work_experiences',
        localField: '_id',
        foreignField: 'user_row_id',
        pipeline: [{ $match: { till_date_status: 2, user_account_type: 2 } }, { $project: { _id: 1 } }],
        as: 'team_members',
      },
    },
    {
      $lookup: {
        from: 'cln_funding_investment_lists',
        localField: '_id',
        foreignField: 'investor_row_id',
        as: 'funding_count',
        pipeline: [
          {
            $lookup: {
              from: 'cln_company_lists',
              let: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' },
              as: 'company_info',
              pipeline: [
                { $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } }, { active_status: 1 }] } },
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
          { $match: { company_data: { $nin: ['', null] }, investor_type: 1, investor_registered_type: 2 } },
        ],
      },
    },
    {
      $set: {
        company_name: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
        company_email_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$info_company.company_email_id', else: '$info_manual_company.company_email_id' } },
        company_logo: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$info_company.company_logo', else: '$info_manual_company.company_logo' } },
        company_approval_status: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$info_company.active_status', else: '$info_manual_company.approval_status' } },
        company_id: { $cond: { if: { $eq: ['$company_type', 1] }, then: '$info_company.company_id', else: '' } },
        speaker_counts: { $size: '$speakers_count' },
        funding_count: { $size: '$funding_count' },
        team_members_count: { $size: '$team_members' },
      },
    },
    {
      $project: {
        _id: 1, gender: 1, full_name: 1, email_id: 1, mobile_number: 1, profile_image: 1, work_position: 1,
        user_link: 1, created_on: 1, updated_on: 1, used_counts: 1, used_types: 1, approval_date: 1,
        approval_status: 1, main_user_row_id: 1, approval_sub_admin_row_id: 1, reject_type: 1, rejected_reason: 1,
        subadmin_name: '$info_subadmin.full_name', company_name: 1, company_email_id: 1, company_logo: 1,
        company_approval_status: 1, speaker_counts: 1, team_members_count: 1, funding_count: 1,
      },
    },
  ]
}

export function buildSpeakersAttendeesSearchArray(userRowId: number, search?: string, type?: number): object[] {
  const searchArray: object[] = [
    {
      active_status: 1,
      approval_status: 1,
      $or: [
        { login_status: 1, list_event_type: 1 },
        { company_active_status: 1, list_event_type: 2 },
        { list_event_type: 3, login_status: 1, company_active_status: 1 },
      ],
    },
  ]
  if (search) searchArray.push({ event_title: { $regex: search, $options: 'i' } })
  if (type === 1) searchArray.push({ speaker_user_row_id: userRowId })
  else if (type === 2) searchArray.push({ attendee_user_row_id: userRowId })
  else searchArray.push({ $or: [{ speaker_user_row_id: userRowId }, { attendee_user_row_id: userRowId }] })
  return searchArray
}

function speakersAttendeesBaseStages(userRowId: number): object[] {
  return [
    { $sort: { end_date: -1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_events_speakers', localField: '_id', foreignField: 'event_row_id', pipeline: [{ $match: { user_row_id: userRowId, user_type: 2 } }], as: 'event_speaker' } },
    { $unwind: { path: '$event_speaker', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_events_attendees', localField: '_id', foreignField: 'event_row_id', pipeline: [{ $match: { user_row_id: userRowId, user_type: 2 } }], as: 'event_guest' } },
    { $unwind: { path: '$event_guest', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        login_status: '$user_info.login_status',
        company_active_status: '$company_info.active_status',
        speaker_user_row_id: { $cond: { if: '$event_speaker.user_row_id', then: '$event_speaker.user_row_id', else: 0 } },
        attendee_user_row_id: { $cond: { if: '$event_guest.user_row_id', then: '$event_guest.user_row_id', else: 0 } },
      },
    },
  ]
}

export function buildSpeakersAttendeesListPipeline(userRowId: number, searchArray: object[]): object[] {
  return [
    ...speakersAttendeesBaseStages(userRowId),
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    { $match: { $and: searchArray } },
    {
      $project: {
        _id: 1, event_title: 1, event_type: 1, event_image: 1, event_city: 1, event_state: 1, event_venue: 1,
        event_url: 1, event_link: 1, start_date: 1, end_date: 1, event_price: 1, speaker_user_row_id: 1,
        attendee_user_row_id: 1,
        invitation_status: { $cond: { if: '$event_guest.invitation_status', then: '$event_guest.invitation_status', else: 0 } },
        login_status: 1, list_event_type: 1,
        registered_type: { $cond: { if: { $eq: ['$speaker_user_row_id', userRowId] }, then: 1, else: 2 } },
        utc_time: '$utc_dates.utc_time',
      },
    },
  ]
}

export function buildSpeakersAttendeesCountPipeline(userRowId: number, searchArray: object[]): object[] {
  return [...speakersAttendeesBaseStages(userRowId), { $match: { $and: searchArray } }, { $count: 'count' }]
}
