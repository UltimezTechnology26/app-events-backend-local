// modules/events/events.pending-list.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /pending_events/:approval_status/:skip/:limit
// (6120) - backs the "Events Approvals" Pending (approval_status=0)/Approved(=1)/Rejected(=2) tabs.
//
// CONFIRMED PERF FIX (lookup-before-paginate), matching the convention already established in
// events.list.queries.ts: the legacy pipeline ran 6 $lookup stages (company/user/tags/utc/
// sub_admin/updated_by) over the ENTIRE matched set before splitting into the `$facet`'s
// data/totalCount branches, paying full join cost to return one page. Fixed here: only the
// tiny tag lookup needed for `tag_status` filtering + counting runs on the full matched set; the
// other 5 lookups move into the `data` branch, after $skip/$limit.
import { getPresentDateTime, createDateTime, startAndEndOfToday, yesterDayStartNEndDate, lastWeekStartEndDate, lastMonthStartEndDate } from '../../../utils/helpers/helper'

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

export function buildPendingEventsMatchQuery({
  approvalStatus,
  search,
  createdType,
  employeeId,
  eventType,
  startDate,
  endDate,
  dateTime,
  eventStatus,
  profileScoreRange,
  presentTime,
}: {
  approvalStatus: number
  search?: string
  createdType?: string
  employeeId?: number
  eventType?: number
  startDate?: string
  endDate?: string
  dateTime?: number
  eventStatus?: number
  profileScoreRange?: string
  presentTime: string
}): Record<string, unknown>[] {
  const query: Record<string, unknown>[] = [{ active_status: 1, approval_status: approvalStatus }]

  if (search) {
    query.push({ $or: [{ event_title: { $regex: search, $options: 'i' } }, { user_name: { $regex: search, $options: 'i' } }] })
  }
  if (createdType === '1') query.push({ created_by_admin_status: 0 })
  if (createdType === '2') query.push({ created_by_admin_status: { $in: [1, 2] } })
  if (employeeId !== undefined && !Number.isNaN(employeeId)) {
    query.push({ created_by_admin_status: 2, created_by_sub_admin_id: employeeId })
  }
  if (eventType !== undefined && !Number.isNaN(eventType)) {
    query.push({ event_type: eventType })
  }
  if (startDate) {
    query.push({ start_date: { $gte: new Date(createDateTime(startDate) as string) } })
  }
  if (startDate && endDate) {
    query.push({ start_date: { $gte: new Date(createDateTime(startDate) as string) }, end_date: { $lte: new Date(createDateTime(endDate) as string) } })
  }
  if (dateTime === 1) query.push({ created_date_n_time: { $gt: new Date((startAndEndOfToday() as { start_date: string }).start_date) } })
  else if (dateTime === 2) {
    const d = yesterDayStartNEndDate() as { start_date: string; end_date: string }
    query.push({ created_date_n_time: { $gte: new Date(d.start_date), $lte: new Date(d.end_date) } })
  } else if (dateTime === 3) {
    const d = lastWeekStartEndDate() as { start_date: string; end_date: string }
    query.push({ created_date_n_time: { $gte: new Date(d.start_date), $lte: new Date(d.end_date) } })
  } else if (dateTime === 4) {
    const d = lastMonthStartEndDate() as { start_date: string; end_date: string }
    query.push({ created_date_n_time: { $gte: new Date(d.start_date), $lte: new Date(d.end_date) } })
  }
  if (eventStatus === 1) query.push({ start_date: { $lte: new Date(presentTime) }, end_date: { $gte: new Date(presentTime) } })
  else if (eventStatus === 2) query.push({ start_date: { $gte: new Date(presentTime) } })
  else if (eventStatus === 3) query.push({ end_date: { $lt: new Date(presentTime) } })

  if (profileScoreRange) {
    const [min, max] = profileScoreRange.split('-').map(Number)
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      query.push({ profile_score: { $gte: min, $lte: max } })
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
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', pipeline: [{ $project: { user_name: 1, full_name: 1, email_id: 1, approval_status: 1, login_status: 1 } }], as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', pipeline: [{ $project: { utc_time: 1 } }], as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'created_by_sub_admin_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'updated_by_row_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'updated_by_user_info' } },
    { $lookup: { from: 'cln_sub_admins', localField: 'updated_by_row_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1 } }], as: 'updated_by_admin_info' } },
    { $addFields: { updated_by_full_name: UPDATED_BY_FULL_NAME_SWITCH } },
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
        claim_status: 1,
        created_date_n_time: 1,
        list_event_type: 1,
        created_by_admin_status: 1,
        created_by_sub_admin_id: 1,
        sub_admin_name: '$sub_admin_info.full_name',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        created_user_name: '$user_info.full_name',
        company_id: '$company_info.company_id',
        company_name: '$company_info.company_name',
        event_tag_array: '$eventTags.event_tag',
        utc_time: '$utc_dates.utc_time',
        user_approval_status: '$user_info.approval_status',
        user_login_status: '$user_info.login_status',
        build_event_page_score: 1,
        seo_details_score: 1,
        contact_details_score: 1,
        tickets_coupons_score: 1,
        speakers_score: 1,
        sponsors_partners_score: 1,
        attendees_score: 1,
        faq_score: 1,
        profile_score: 1,
        updated_by: 1,
        updated_by_row_id: 1,
        updated_date_n_time: 1,
        updated_by_full_name: 1,
      },
    },
  ]
}

export function buildPendingEventsPipeline({ query, skip, limit, tagStatus }: { query: Record<string, unknown>[]; skip: number; limit: number; tagStatus?: number }) {
  return [
    { $sort: { _id: -1 as const } },
    { $match: { $and: query } },
    { $addFields: { tagIds: TAG_IDS_ADDFIELD } },
    { $lookup: { from: 'cln_events_tags', let: { tagIds: '$tagIds' }, pipeline: [{ $match: { $expr: { $in: ['$_id', '$$tagIds'] } } }, { $match: { active_status: true } }, { $project: { event_tag: 1 } }], as: 'eventTags' } },
    ...(tagStatus === 1 ? [{ $match: { eventTags: { $ne: [] } } }] : []),
    ...(tagStatus === 0 ? [{ $match: { eventTags: { $eq: [] } } }] : []),
    {
      $facet: {
        data: buildDataStages({ skip, limit }),
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractPendingEventsResult(aggregateOutput: any[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, totalCount: facetResult.totalCount?.[0]?.count ?? 0 }
}
