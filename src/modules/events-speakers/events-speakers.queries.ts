// modules/events-speakers/events-speakers.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /speakers_list (10876),
// GET /speaker_basic_details/:user_type/:user_row_id (11297), GET /speaker_events (11418),
// GET /speakers_overview (11692) — the "Speakers" admin menu page (list + overview widget) and
// its individual-speaker detail/events sub-views. No perf bug found in any of these four: all
// already use a single $facet or single aggregate call, ported as-is.
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'
import { joinPositionNamesExpr } from '../funding/funding.queries'

/** Ported verbatim from event.js:10797 buildSpeakersListInfoWorkPipeline (own literal function, not merged with the two below — this codebase's own established convention, per its existing comments, is to keep each ported pipeline traceable to its exact legacy location even when structurally near-identical). */
export function buildSpeakersListInfoWorkPipeline() {
  return [
    { $match: { $and: [{ user_row_id: { $nin: ['', null] } }, { $expr: { $and: [{ $eq: ['$user_row_id', '$$user_row_id'] }, { $eq: ['$public_view', true] }, { $eq: ['$user_account_type', '$$user_type'] }] } }] } },
    { $limit: 1 },
    ...getPositionResolutionStages(),
    { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'info_company',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }, { $eq: ['$active_status', 1] }] } } }, { $project: { _id: 1, company_name: 1 } }],
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
    { $project: { position_name: '$resolved_position_name', company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } } } },
  ]
}

/** Ported verbatim from event.js:11092 buildSpeakerBasicDetailsRegisteredInfoWorkPipeline (user_type===1 branch). */
export function buildSpeakerBasicDetailsRegisteredInfoWorkPipeline() {
  return [
    { $match: { $and: [{ user_row_id: { $nin: ['', null] } }, { $expr: { $and: [{ $eq: ['$user_row_id', '$$user_row_id'] }, { $eq: ['$public_view', true] }, { $eq: ['$user_account_type', 1] }] } }] } },
    ...getPositionResolutionStages(),
    { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
    { $limit: 1 },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'info_company',
        pipeline: [{ $match: { $and: [{ active_status: 1 }, { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } }] } }, { $project: { _id: 1, company_name: 1 } }],
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
    { $project: { position_name: '$resolved_position_name', company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } } } },
  ]
}

/** Ported verbatim from event.js:11201 buildSpeakerBasicDetailsManualInfoWorkPipeline (user_type===2 branch) — kept as its own separately-named function, matching the legacy file's own explicit convention ("never merge near-identical locations"), even though its only difference from the Registered variant above is the user_account_type match value. */
export function buildSpeakerBasicDetailsManualInfoWorkPipeline() {
  return [
    { $match: { $and: [{ user_row_id: { $nin: ['', null] } }, { $expr: { $and: [{ $eq: ['$user_row_id', '$$user_row_id'] }, { $eq: ['$public_view', true] }, { $eq: ['$user_account_type', 2] }] } }] } },
    ...getPositionResolutionStages(),
    { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
    { $limit: 1 },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { company_type: '$company_type', company_row_id: '$company_row_id' },
        as: 'info_company',
        pipeline: [{ $match: { $and: [{ active_status: 1 }, { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } }] } }, { $project: { _id: 1, company_name: 1 } }],
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
    { $project: { position_name: '$resolved_position_name', company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } } } },
  ]
}

export function buildSpeakersListPipeline({ matchEventQuery, query, skip, limit }: { matchEventQuery: Record<string, unknown>[]; query: Record<string, unknown>[]; skip: number; limit: number }) {
  return [
    { $match: { user_type: { $nin: ['', null] } } },
    { $lookup: { from: 'cln_events', localField: 'event_row_id', foreignField: '_id', as: 'event_info', pipeline: [{ $match: { $and: matchEventQuery } }, { $project: { _id: 1 } }] } },
    { $unwind: { path: '$event_info' } },
    { $group: { _id: { user_type: '$user_type', user_row_id: '$user_row_id' }, count: { $sum: 1 } } },
    { $sort: { count: -1 as const } },
    {
      $lookup: {
        from: 'cln_professionals',
        localField: '_id.user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [
          { $match: { login_status: 1 } },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info', pipeline: [{ $limit: 1 }, { $project: { _id: 0, profile_image: 1 } }] } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1, pro_batch: 1, approval_status: 1, login_status: 1, profile_image: '$img_info.profile_image' } },
          { $limit: 1 },
        ],
      },
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $set: { login_status: { $cond: { if: { $eq: ['$_id.user_type', 1] }, then: '$user_info.login_status', else: 1 } } } },
    { $match: { login_status: 1 } },
    { $lookup: { from: 'cln_professionals_manual_retrievals', localField: '_id.user_row_id', foreignField: '_id', as: 'manual_info', pipeline: [{ $project: { _id: 1, full_name: 1, email_id: 1, profile_image: 1 } }, { $limit: 1 }] } },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    { $set: { user_data: { $switch: { branches: [{ case: { $eq: ['$_id.user_type', 1] }, then: '$user_info' }, { case: { $eq: ['$_id.user_type', 2] }, then: '$manual_info' }], default: '' } } } },
    { $set: { user_name: { $ifNull: ['$user_data.user_name', ''] }, full_name: '$user_data.full_name', email_id: { $ifNull: ['$user_data.email_id', ''] }, pro_batch: { $ifNull: ['$user_data.pro_batch', ''] }, user_type: '$_id.user_type' } },
    { $match: { $and: query } },
    {
      $facet: {
        totalCount: [{ $count: 'count' }],
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_professionals_work_experiences', let: { user_type: '$_id.user_type', user_row_id: '$user_data._id' }, as: 'info_work', pipeline: buildSpeakersListInfoWorkPipeline() } },
          { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              count: 1,
              user_row_id: '$_id.user_row_id',
              user_type: 1,
              user_name: 1,
              full_name: 1,
              pro_batch: 1,
              email_id: 1,
              approval_status: '$user_data.approval_status',
              login_status: '$user_data.login_status',
              profile_image: '$user_data.profile_image',
              work_position: '$info_work.position_name',
              company_name: '$info_work.company_name',
            },
          },
        ],
      },
    },
  ]
}

export function buildSpeakerBasicDetailsRegisteredPipeline(userRowId: number) {
  return [
    { $match: { _id: userRowId } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info', pipeline: [{ $project: { profile_image: 1 } }] } },
    { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_work_experiences', let: { user_row_id: '$_id' }, pipeline: buildSpeakerBasicDetailsRegisteredInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, user_name: 1, full_name: 1, pro_batch: 1, email_id: 1, position_name: '$info_work.position_name', company_name: '$info_work.company_name', profile_image: '$img_info.profile_image', approval_status: 1 } },
  ]
}

export function buildSpeakerBasicDetailsManualPipeline(userRowId: number) {
  return [
    { $match: { _id: userRowId } },
    { $lookup: { from: 'cln_professionals_work_experiences', let: { user_row_id: '$_id' }, pipeline: buildSpeakerBasicDetailsManualInfoWorkPipeline(), as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, full_name: 1, pro_batch: 1, email_id: 1, profile_image: 1, position_name: '$info_work.position_name', company_name: '$info_work.company_name' } },
  ]
}

export function buildSpeakerEventsPipeline({ userType, userRowId, query }: { userType: number; userRowId: number; query: Record<string, unknown>[] }) {
  return [
    { $match: { user_type: userType, user_row_id: userRowId } },
    {
      $lookup: {
        from: 'cln_events',
        localField: 'event_row_id',
        foreignField: '_id',
        as: 'event_info',
        pipeline: [
          { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'host_info' } },
          { $unwind: { path: '$host_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
          { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
          { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
          { $match: { $and: query } },
          {
            $project: {
              _id: 1,
              list_event_type: 1,
              active_status: 1,
              event_title: 1,
              event_url: 1,
              start_date: 1,
              end_date: 1,
              event_type: 1,
              event_image: 1,
              event_price: 1,
              approval_status: 1,
              user_name: '$host_info.user_name',
              full_name: '$host_info.full_name',
              company_id: '$company_info.company_id',
              company_name: '$company_info.company_name',
              utc_time: '$utc_dates.utc_time',
            },
          },
        ],
      },
    },
    { $unwind: { path: '$event_info' } },
    {
      $project: {
        event_row_id: 1,
        list_event_type: '$event_info.list_event_type',
        active_status: '$event_info.active_status',
        event_title: '$event_info.event_title',
        event_url: '$event_info.event_url',
        start_date: '$event_info.start_date',
        end_date: '$event_info.end_date',
        event_type: '$event_info.event_type',
        event_image: '$event_info.event_image',
        event_price: '$event_info.event_price',
        approval_status: '$event_info.approval_status',
        user_name: '$event_info.user_name',
        full_name: '$event_info.full_name',
        company_id: '$event_info.company_id',
        company_name: '$event_info.company_name',
        utc_time: '$event_info.utc_time',
      },
    },
  ]
}

export function buildSpeakersOverviewPipeline(presentDateTime: string) {
  return [
    { $match: { user_type: { $nin: ['', null] } } },
    { $lookup: { from: 'cln_events', localField: 'event_row_id', foreignField: '_id', as: 'event_info', pipeline: [{ $project: { _id: 1, end_date: 1 } }] } },
    { $unwind: { path: '$event_info' } },
    { $group: { _id: { user_row_id: '$user_row_id', user_type: '$user_type' }, max_end_date: { $max: '$event_info.end_date' } } },
    { $lookup: { from: 'cln_professionals', localField: '_id.user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1, login_status: 1 } }, { $limit: 1 }] } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $set: { login_status: { $cond: { if: { $eq: ['$_id.user_type', 1] }, then: '$user_info.login_status', else: 1 } } } },
    { $match: { login_status: 1 } },
    {
      $facet: {
        register_count: [{ $match: { '_id.user_type': 1 } }, { $count: 'count' }],
        register_active_count: [{ $match: { '_id.user_type': 1, max_end_date: { $gte: new Date(presentDateTime) } } }, { $count: 'count' }],
        manual_count: [{ $match: { '_id.user_type': 2 } }, { $count: 'count' }],
        manual_active_count: [{ $match: { '_id.user_type': 2, max_end_date: { $gte: new Date(presentDateTime) } } }, { $count: 'count' }],
      },
    },
  ]
}
