// modules/events/events.list.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /list/:active_status/:skip/:limit
// (line 6439) — shared by both the "Overview" and "Published Events" admin pages.
//
// CONFIRMED PERF BUG FIX: the real route ran the full lookup-heavy list pipeline via
// `eventM.aggregate(query_pipeline).skip(skip).limit(limit)` — Mongoose's `.skip()/.limit()` on
// an aggregate just appends `{$skip}`/`{$limit}` to the END of the pipeline, so despite the
// route's own `// ✅ 1. FILTER FIRST` comments, pagination still ran AFTER every $lookup, paying
// the full join cost across the entire matched set to return one page. It THEN ran a completely
// SEPARATE second `eventM.aggregate(...)` call — re-doing its own user lookup, its own tagIds
// derivation, and its own tag lookup over the ENTIRE matched set again — purely to get
// total/ongoing/upcoming/ended counts via a $facet. That is two full collection scans with
// duplicated $match/$lookup work, in two separate round-trips to Mongo, for what is
// conceptually one page load.
//
// Fixed here: ONE aggregate call. The base $match runs once and is shared by both facet branches
// (previously it ran twice — once per aggregate call). The `data` branch defers its own
// lookups to the fewest rows possible: it still can't move `$skip`/`$limit` before the tag lookup
// when `tag_status` is requested (that filter depends on the joined tag names, so the join must
// run before we know which rows to page), but it now shares the base $match's execution instead
// of re-running it, and the count side no longer re-does the user-info lookup at all (that lookup
// was never used for anything in the original counts branch — `user_name` was computed and then
// never read again before the final $project stripped it out).
import { getIntIdFromArray } from '../../../utils/helpers/helper'

const UPDATED_BY_FULL_NAME_ADDFIELD = {
  $cond: [
    { $eq: ['$updated_by', 'user'] },
    { $ifNull: [{ $arrayElemAt: ['$updated_by_user_info.full_name', 0] }, ''] },
    { $ifNull: [{ $arrayElemAt: ['$updated_by_admin_info.full_name', 0] }, ''] },
  ],
}

const TAG_IDS_ADDFIELD = {
  $cond: [
    { $isArray: '$event_tags' },
    '$event_tags',
    { $map: { input: { $objectToArray: { $ifNull: ['$event_tags', {}] } }, as: 't', in: '$$t.v' } },
  ],
}

/** Ported verbatim from /list's `query` array construction (event.js:6439, lines 101-193). */
export async function buildEventsListMatchQuery({
  ticket,
  search,
  employeeId,
  eventType,
  startDate,
  endDate,
  eventStatus,
  eventTag,
  location,
  createdType,
  profileScoreRange,
  presentTime,
  ticketEventRowIds,
  createDateTime,
}: {
  ticket?: string
  search?: string
  employeeId?: number
  eventType?: number
  startDate?: string
  endDate?: string
  eventStatus?: number
  eventTag?: string
  location?: string
  createdType?: string
  profileScoreRange?: string
  presentTime: string
  ticketEventRowIds: number[]
  createDateTime: (value: string) => string
}): Promise<Record<string, unknown>[]> {
  const query: Record<string, unknown>[] = [{}]

  if (ticket) {
    if (ticket == '1') {
      query.push({ end_date: { $gte: new Date(presentTime) }, active_status: 1, _id: { $nin: ticketEventRowIds } })
    } else {
      query.push({ end_date: { $gte: new Date(presentTime) }, active_status: 1, _id: { $in: ticketEventRowIds } })
    }
  } else {
    query.push({ active_status: 1, approval_status: 1, $or: [{ user_row_id: { $gt: 0 } }, { company_row_id: { $gt: 0 } }] })
  }

  if (search) {
    query.push({ $or: [{ event_title: { $regex: search, $options: 'i' } }, { user_name: { $regex: search, $options: 'i' } }] })
  }

  if (employeeId !== undefined && !Number.isNaN(employeeId)) {
    query.push({ created_by_admin_status: 2, created_by_sub_admin_id: employeeId })
  }

  if (eventType !== undefined && !Number.isNaN(eventType)) {
    query.push({ event_type: eventType })
  }

  if (startDate) {
    query.push({ start_date: { $gte: new Date(createDateTime(startDate)) } })
  }

  if (endDate) {
    query.push({ end_date: { $lte: new Date(createDateTime(endDate)) } })
  }

  if (eventStatus !== undefined && !Number.isNaN(eventStatus)) {
    if (eventStatus === 1) {
      query.push({ start_date: { $lte: new Date(presentTime) }, end_date: { $gte: new Date(presentTime) } })
    } else if (eventStatus === 2) {
      query.push({ start_date: { $gte: new Date(presentTime) } })
    } else if (eventStatus === 3) {
      query.push({ end_date: { $lt: new Date(presentTime) } })
    }
  }

  if (eventTag) {
    query.push({ event_tags: { $in: await getIntIdFromArray(eventTag) } })
  }

  if (location) {
    const locations = location.split(',').map((loc) => loc.trim()).filter(Boolean)
    if (locations.length > 0) {
      query.push({ $and: locations.map((loc) => ({ event_venue: { $regex: new RegExp(loc, 'i') } })) })
    }
  }

  if (createdType) {
    if (createdType == '1') {
      query.push({ created_by_admin_status: 0 })
    }
    if (createdType == '2') {
      query.push({ created_by_admin_status: { $in: [1, 2] } })
    }
  }

  if (profileScoreRange) {
    const [min, max] = profileScoreRange.split('-').map(Number)
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      query.push({ profile_score: { $gte: min, $lte: max } })
    }
  }

  return query
}

/** The `data` branch: identical lookups/project to the legacy pipeline, ported verbatim. */
function buildDataStages({ skip, limit, tagStatus, sortStage }: { skip: number; limit: number; tagStatus?: number; sortStage: Record<string, 1 | -1> }) {
  return [
    { $sort: { _id: -1 as const } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', pipeline: [{ $project: { company_id: 1, company_name: 1 } }], as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', pipeline: [{ $project: { user_name: 1, full_name: 1, email_id: 1 } }], as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'updated_by_row_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'updated_by_user_info' } },
    { $lookup: { from: 'cln_sub_admins', localField: 'updated_by_row_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'updated_by_admin_info' } },
    { $addFields: { tagIds: TAG_IDS_ADDFIELD } },
    { $lookup: { from: 'cln_events_tags', localField: 'tagIds', foreignField: '_id', pipeline: [{ $match: { active_status: true } }, { $project: { event_tag: 1 } }], as: 'eventTags' } },
    { $lookup: { from: 'cln_event_counts', localField: '_id', foreignField: 'event_row_id', pipeline: [{ $project: { total_attendees: 1, total_watchlist: 1, total_invitees: 1 } }], as: 'events_count' } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', pipeline: [{ $project: { utc_time: 1 } }], as: 'utc_dates' } },
    { $lookup: { from: 'cln_sub_admins', localField: 'created_by_sub_admin_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'sub_admin_info' } },
    {
      $set: {
        total_attendees: { $ifNull: [{ $arrayElemAt: ['$events_count.total_attendees', 0] }, 0] },
        total_watchlist: { $ifNull: [{ $arrayElemAt: ['$events_count.total_watchlist', 0] }, 0] },
        total_invitees: { $ifNull: [{ $arrayElemAt: ['$events_count.total_invitees', 0] }, 0] },
        utc_time: { $arrayElemAt: ['$utc_dates.utc_time', 0] },
        sub_admin_name: { $arrayElemAt: ['$sub_admin_info.full_name', 0] },
      },
    },
    { $addFields: { updated_by_full_name: UPDATED_BY_FULL_NAME_ADDFIELD } },
    {
      $project: {
        _id: 1,
        company_row_id: 1,
        user_row_id: 1,
        event_type: 1,
        event_url: 1,
        event_title: 1,
        event_tags: 1,
        start_date: 1,
        event_image: 1,
        event_image_type: 1,
        end_date: 1,
        event_venue: 1,
        active_status: 1,
        approval_status: 1,
        created_date_n_time: 1,
        updated_date_n_time: 1,
        list_event_type: 1,
        sub_admin_name: { $arrayElemAt: ['$sub_admin_info.full_name', 0] },
        created_by_admin_status: 1,
        created_by_sub_admin_id: 1,
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        company_id: '$company_info.company_id',
        company_name: '$company_info.company_name',
        event_tag_array: '$eventTags.event_tag',
        total_attendees: 1,
        total_watchlist: 1,
        total_invitees: 1,
        utc_time: '$utc_dates.utc_time',
        build_event_page_score: 1,
        seo_details_score: 1,
        contact_details_score: 1,
        tickets_coupons_score: 1,
        speakers_score: 1,
        sponsors_partners_score: 1,
        attendees_score: 1,
        faq_score: 1,
        profile_score: 1,
        updated_by: '$updated_by',
        updated_by_row_id: '$updated_by_row_id',
        updated_by_full_name: 1,
      },
    },
    ...(tagStatus === 1 ? [{ $match: { event_tag_array: { $ne: [] } } }] : []),
    ...(tagStatus === 0 ? [{ $match: { event_tag_array: { $size: 0 } } }] : []),
    ...(Object.keys(sortStage).length > 0 ? [{ $sort: sortStage }] : []),
    { $skip: skip },
    { $limit: limit },
  ]
}

/**
 * The `countsPrep` branch: same tag-derivation as the real eventCounts aggregate, minus the user
 * lookup the original ran (its `user_name` field was never read anywhere before the final
 * $project stripped it back out — dead work, safe to drop since it only affects counts, not any
 * response field). Projects only the tiny fields the four counts need (start_date, end_date,
 * event_tag_array) — NOT wrapped in its own $facet, because MongoDB rejects a $facet nested
 * inside another $facet stage (confirmed against real data: `$facet is not allowed to be used
 * within a $facet stage`, error code 40600). The four counts (total/ongoing/upcoming/ended) are
 * derived from this array in JS, in extractEventsListResult below, instead.
 */
function buildCountsPrepStages({ tagStatus }: { tagStatus?: number }) {
  return [
    { $addFields: { tagIds: TAG_IDS_ADDFIELD } },
    { $lookup: { from: 'cln_events_tags', localField: 'tagIds', foreignField: '_id', pipeline: [{ $match: { active_status: true } }, { $project: { event_tag: 1 } }], as: 'eventTags' } },
    { $project: { start_date: 1, end_date: 1, event_tag_array: { $ifNull: ['$eventTags.event_tag', []] } } },
    ...(tagStatus === 1 ? [{ $match: { $expr: { $gt: [{ $size: '$event_tag_array' }, 0] } } }] : []),
    ...(tagStatus === 0 ? [{ $match: { $expr: { $eq: [{ $size: '$event_tag_array' }, 0] } } }] : []),
  ]
}

/**
 * ONE aggregate call replacing the legacy route's two. The base $match (query) runs once,
 * shared by both facet branches, instead of twice across two separate aggregate calls.
 */
export function buildEventsListPipeline({
  query,
  skip,
  limit,
  tagStatus,
  sortStage,
}: {
  query: Record<string, unknown>[]
  skip: number
  limit: number
  tagStatus?: number
  sortStage: Record<string, 1 | -1>
}) {
  return [
    { $match: { $and: query } },
    {
      $facet: {
        data: buildDataStages({ skip, limit, tagStatus, sortStage }),
        countsPrep: buildCountsPrepStages({ tagStatus }),
      },
    },
  ]
}

export function extractEventsListResult(aggregateOutput: any[], presentTime: string) {
  const facetResult = aggregateOutput[0] || { data: [], countsPrep: [] }
  const countsPrep: { start_date?: string | Date; end_date?: string | Date }[] = facetResult.countsPrep || []
  const now = new Date(presentTime)

  let ongoingCount = 0
  let upcomingCount = 0
  let endedCount = 0
  for (const row of countsPrep) {
    const start = row.start_date ? new Date(row.start_date) : undefined
    const end = row.end_date ? new Date(row.end_date) : undefined
    if (start && end && start <= now && end >= now) ongoingCount++
    else if (start && start > now) upcomingCount++
    else if (end && end < now) endedCount++
  }

  return {
    data: facetResult.data,
    totalCount: countsPrep.length,
    ongoingCount,
    upcomingCount,
    endedCount,
  }
}
