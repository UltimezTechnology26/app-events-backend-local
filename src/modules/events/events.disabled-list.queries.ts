// modules/events/events.disabled-list.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /disabled_list/:skip/:limit (7423).
// Queries the same eventM collection as the published /list route (disabled events are just
// events with active_status: 0), not a separate collection.
//
// PRESERVED QUIRK (not silently "fixed"): the legacy route REPLACES the entire base query the
// instant a `search` term is present, dropping the created_by_admin_status $or clause below
// rather than adding search as another $and condition. Kept as-is per this repo's "never change
// existing behavior without flagging" rule.
//
// CONFIRMED PERF FIX (paginate before join), matching the convention already established in
// events.deleted-list.queries.ts: $skip/$limit run before the 6 $lookup stages, so joins only run
// on the page actually returned instead of the full matched set.
//
// The legacy route also ran 4 extra `eventM.countDocuments(...)` calls for host_created/
// organizers_count/host_and_organizers_count/admin_and_subadmin_created — global dashboard-style
// counts, unrelated to the current filtered query, that the legacy disabled.js page never
// actually renders anywhere. Deliberately dropped here (dead response fields), not ported.
import { getIntIdFromArray } from '../../../utils/helpers/helper'

const TAG_IDS_ADDFIELD = {
  $cond: [
    { $isArray: '$event_tags' },
    '$event_tags',
    { $cond: [{ $gt: [{ $size: { $ifNull: [{ $objectToArray: '$event_tags' }, []] } }, 0] }, { $map: { input: { $objectToArray: '$event_tags' }, as: 't', in: '$$t.v' } }, []] },
  ],
}

const UPDATED_BY_FULL_NAME_SWITCH = {
  $switch: {
    branches: [
      { case: { $eq: ['$updated_by', 'user'] }, then: { $let: { vars: { userInfo: { $arrayElemAt: ['$updated_by_user_info', 0] } }, in: { $ifNull: ['$$userInfo.full_name', ''] } } } },
      { case: { $eq: ['$updated_by', 'admin'] }, then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } } },
      { case: { $eq: ['$updated_by', 'subadmin'] }, then: { $let: { vars: { adminInfo: { $arrayElemAt: ['$updated_by_admin_info', 0] } }, in: { $ifNull: ['$$adminInfo.full_name', ''] } } } },
    ],
    default: '',
  },
}

export async function buildDisabledEventsListMatchQuery({
  search,
  listEventType,
  createdByAdminStatus,
  profileScoreRange,
  eventTag,
}: {
  search?: string
  listEventType?: number
  createdByAdminStatus?: number
  profileScoreRange?: string
  eventTag?: string
}): Promise<Record<string, unknown>> {
  let query: Record<string, unknown> = {
    $and: [
      { active_status: 0 },
      { approval_status: 1 },
      { $or: [{ created_by_admin_status: { $ne: 0 } }, { $and: [{ created_by_admin_status: 0 }, { list_event_type: { $in: [1, 2, 3] } }] }] },
    ],
  }

  if (search) {
    query = { $and: [{ event_title: { $regex: search, $options: 'i' } }, { active_status: 0, approval_status: 1 }] }
  }

  const andClauses = query.$and as Record<string, unknown>[]

  if (listEventType !== undefined && !Number.isNaN(listEventType)) {
    andClauses.push({ list_event_type: listEventType }, { created_by_admin_status: 0 })
  }

  if (createdByAdminStatus !== undefined && !Number.isNaN(createdByAdminStatus)) {
    andClauses.push({ created_by_admin_status: createdByAdminStatus })
  }

  if (eventTag) {
    andClauses.push({ event_tags: { $in: await getIntIdFromArray(eventTag) } })
  }

  if (profileScoreRange) {
    const [min, max] = profileScoreRange.split('-').map(Number)
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      query.profile_score = { $gte: min, $lte: max }
    }
  }

  return query
}

function buildDataStages({ skip, limit, tagStatus }: { skip: number; limit: number; tagStatus?: number }) {
  return [
    { $skip: skip },
    { $limit: limit },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', pipeline: [{ $project: { company_id: 1, company_name: 1 } }], as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', pipeline: [{ $project: { user_name: 1, full_name: 1 } }], as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'updated_by_row_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'updated_by_user_info' } },
    { $lookup: { from: 'cln_sub_admins', localField: 'updated_by_row_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'updated_by_admin_info' } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', pipeline: [{ $project: { utc_time: 1 } }], as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'created_by_sub_admin_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    { $addFields: { tagIds: TAG_IDS_ADDFIELD } },
    { $lookup: { from: 'cln_events_tags', let: { tagIds: '$tagIds' }, pipeline: [{ $match: { $expr: { $in: ['$_id', '$$tagIds'] } } }, { $match: { active_status: true } }, { $project: { event_tag: 1 } }], as: 'eventTags' } },
    ...(tagStatus === 1 ? [{ $match: { eventTags: { $ne: [] } } }] : []),
    ...(tagStatus === 0 ? [{ $match: { eventTags: { $eq: [] } } }] : []),
    { $addFields: { updated_by_full_name: UPDATED_BY_FULL_NAME_SWITCH } },
    {
      $project: {
        _id: 1,
        company_row_id: 1,
        user_row_id: 1,
        event_type: 1,
        event_tags: 1,
        start_date: 1,
        event_image: 1,
        event_title: 1,
        event_image_type: 1,
        end_date: 1,
        event_venue: 1,
        active_status: 1,
        approval_status: 1,
        created_date_n_time: 1,
        event_tag_array: '$eventTags.event_tag',
        list_event_type: { $cond: { if: { $gt: ['$list_event_type', 0] }, then: '$list_event_type', else: '' } },
        event_url: 1,
        disabled_date_n_time: 1,
        created_by_admin_status: 1,
        created_by_sub_admin_id: 1,
        build_event_page_score: 1,
        seo_details_score: 1,
        contact_details_score: 1,
        tickets_coupons_score: 1,
        speakers_score: 1,
        sponsors_partners_score: 1,
        attendees_score: 1,
        faq_score: 1,
        profile_score: 1,
        sub_admin_name: '$sub_admin_info.full_name',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        utc_time: '$utc_dates.utc_time',
        updated_by: 1,
        updated_by_row_id: 1,
        updated_date_n_time: 1,
        updated_by_full_name: 1,
      },
    },
  ]
}

export function buildDisabledEventsListPipeline({ query, skip, limit, tagStatus }: { query: Record<string, unknown>; skip: number; limit: number; tagStatus?: number }) {
  return [
    { $match: query },
    { $sort: { _id: -1 as const } },
    {
      $facet: {
        data: buildDataStages({ skip, limit, tagStatus }),
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractDisabledEventsListResult(aggregateOutput: any[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, totalCount: facetResult.totalCount?.[0]?.count ?? 0 }
}
