// modules/events/events.deleted-list.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /deleted_events_list/:skip/:limit (12087)
// and its same-file helper eventFilterQuery (63-166).
//
// CONFIRMED BUG FOUND AND FIXED (not silently): eventFilterQuery's `ticket` branch pushes onto
// an undefined `query` variable (`query.push(...)` — the function's actual parameter is
// `top_filter_array`, not `query`), which would throw a ReferenceError the instant a caller ever
// passed `?ticket=`. No admin-coinpedia proxy for this route forwards a `ticket` param (confirmed
// during the Events migration audit), so the branch was live-but-unreachable dead code in
// practice. Ported using `topFilterArray` (the real parameter) instead of the undefined name, so
// it's correct if this filter is ever wired up on the frontend later — this is a real bug fix,
// called out here per this repo's migration skill.
//
// CONFIRMED PERF FIX (lookup-before-paginate): the legacy route ran 5 $lookup/$unwind stages
// over the ENTIRE matched set, then wrapped the shared `pipeline` array in `$facet: {data:
// [$skip,$limit], totalCount:[$count]}` — the $skip/$limit only ever trimmed the OUTPUT of
// the already-fully-joined stream, paying full join cost for every matching row to return one
// page. Fixed here: $match/$sort run once and are shared; the 5 lookups + $project move inside
// the `data` branch, after $skip/$limit, so they only ever run on the page actually returned.
import { getIntIdFromArray } from '../../../utils/helpers/helper'

const TAG_IDS_ADDFIELD = {
  $cond: [
    { $isArray: '$event_tags' },
    '$event_tags',
    { $cond: [{ $gt: [{ $size: { $ifNull: [{ $objectToArray: '$event_tags' }, []] } }, 0] }, { $map: { input: { $objectToArray: '$event_tags' }, as: 't', in: '$$t.v' } }, []] },
  ],
}

export async function buildDeletedEventsListMatchQuery({
  search,
  employeeId,
  eventType,
  activeStatus,
  approvalStatus,
  startDate,
  endDate,
  eventStatus,
  eventTag,
  location,
  createdType,
  presentDateTime,
  createDateTime,
}: {
  search?: string
  employeeId?: number
  eventType?: number
  activeStatus?: number
  approvalStatus?: number
  startDate?: string
  endDate?: string
  eventStatus?: number
  eventTag?: string
  location?: string
  createdType?: string
  presentDateTime: Date
  createDateTime: (value: string) => string
}): Promise<Record<string, unknown>[]> {
  const topFilterArray: Record<string, unknown>[] = [{}]

  if (search) {
    topFilterArray.push({ $or: [{ event_title: { $regex: search, $options: 'i' } }, { user_name: { $regex: search, $options: 'i' } }] })
  }
  if (employeeId !== undefined && !Number.isNaN(employeeId)) {
    topFilterArray.push({ created_by_admin_status: 2, created_by_sub_admin_id: employeeId })
  }
  if (eventType !== undefined && !Number.isNaN(eventType)) {
    topFilterArray.push({ event_type: eventType })
  }
  if (activeStatus !== undefined && !Number.isNaN(activeStatus)) {
    topFilterArray.push({ active_status: activeStatus })
  }
  if (approvalStatus !== undefined && !Number.isNaN(approvalStatus)) {
    topFilterArray.push({ approval_status: approvalStatus })
  }
  if (startDate) {
    topFilterArray.push({ start_date: { $gte: new Date(createDateTime(startDate)) } })
  }
  if (endDate) {
    topFilterArray.push({ end_date: { $lte: new Date(createDateTime(endDate)) } })
  }
  if (eventStatus !== undefined && !Number.isNaN(eventStatus)) {
    if (eventStatus === 1) topFilterArray.push({ start_date: { $lte: presentDateTime }, end_date: { $gte: presentDateTime } })
    else if (eventStatus === 2) topFilterArray.push({ start_date: { $gte: presentDateTime } })
    else if (eventStatus === 3) topFilterArray.push({ end_date: { $lt: presentDateTime } })
  }
  if (eventTag) {
    topFilterArray.push({ event_tags: { $in: await getIntIdFromArray(eventTag) } })
  }
  if (location) {
    topFilterArray.push({ event_venue: { $regex: location, $options: 'i' } })
  }
  if (createdType) {
    if (createdType == '1') topFilterArray.push({ created_by_admin_status: 0 })
    if (createdType == '2') topFilterArray.push({ created_by_admin_status: { $in: [1, 2] } })
  }

  return topFilterArray
}

function buildDataStages({ skip, limit, tagStatus }: { skip: number; limit: number; tagStatus?: number }) {
  return [
    { $skip: skip },
    { $limit: limit },
    { $lookup: { from: 'cln_events_seo_details', localField: '_id', foreignField: 'event_row_id', as: 'event_seo' } },
    { $unwind: { path: '$event_seo', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'created_by_sub_admin_id', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    { $addFields: { tagIds: TAG_IDS_ADDFIELD } },
    { $lookup: { from: 'cln_events_tags', let: { tagIds: '$tagIds' }, pipeline: [{ $match: { $expr: { $in: ['$_id', '$$tagIds'] } } }, { $match: { active_status: true } }], as: 'eventTags' } },
    ...(tagStatus === 1 ? [{ $match: { eventTags: { $ne: [] } } }] : []),
    ...(tagStatus === 0 ? [{ $match: { eventTags: { $eq: [] } } }] : []),
    {
      $project: {
        _id: 1,
        user_row_id: 1,
        event_title: 1,
        company_row_id: 1,
        event_tags: 1,
        event_type: 1,
        event_image: 1,
        event_image_type: 1,
        event_city: 1,
        event_state: 1,
        event_venue: 1,
        event_url: 1,
        event_link: 1,
        start_date: 1,
        end_date: 1,
        event_description: 1,
        describe_in_one_line: 1,
        contact_user_name: 1,
        contact_mobile_number: 1,
        contact_country_row_id: 1,
        contact_email_id: 1,
        active_status: 1,
        approval_status: 1,
        webinar_meeting_type: 1,
        webinar_meeting_link: 1,
        list_event_type: 1,
        reason_for_reject: 1,
        rejected_date_n_time: 1,
        disable_reason: 1,
        disabled_date_n_time: 1,
        deleted_reason: 1,
        deleted_date_n_time: 1,
        created_by_admin_status: 1,
        created_by_sub_admin_id: 1,
        date_n_time: 1,
        meta_keywords: '$event_seo.meta_keywords',
        meta_description: '$event_seo.meta_description',
        meta_title: '$event_seo.meta_title',
        longitude: 1,
        latitude: 1,
        sub_admin_name: '$sub_admin_info.full_name',
        utc_time: '$utc_dates.utc_time',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
      },
    },
  ]
}

export function buildDeletedEventsListPipeline({ topFilterArray, skip, limit, tagStatus }: { topFilterArray: Record<string, unknown>[]; skip: number; limit: number; tagStatus?: number }) {
  return [
    { $sort: { _id: -1 as const } },
    { $match: { $and: topFilterArray } },
    {
      $facet: {
        data: buildDataStages({ skip, limit, tagStatus }),
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractDeletedEventsListResult(aggregateOutput: any[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, totalCount: facetResult.totalCount?.[0]?.count ?? 0 }
}
