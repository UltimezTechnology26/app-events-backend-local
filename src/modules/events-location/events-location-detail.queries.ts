// modules/events-location/events-location-detail.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /searched_users_list/:type/:location_row_id
// (line 12778) — backs the Location List page's "View" modal, 2 tabs: "Registered users"
// (type===1, professionals_location_searchM) and "Created Events" (type!==1,
// event_search_locationM correlated to cln_events by city/state/country).
import { startAndEndOfWeek, monthStartEndDate, createDateTime, createEndDateOnly } from '../../../utils/helpers/helper'

/**
 * Ported verbatim from the legacy route's own date_range branching (event.js:12791-12806) -
 * date_range 1 = custom start/end, 2 = "This Week", 3 = "This Month", anything else = no filter.
 * All 3 branches filter on `updated_date_n_time`.
 */
export function buildLocationDetailDateMatch(dateRange?: number, startDate?: string, endDate?: string): Record<string, unknown>[] {
  if (dateRange === 1 && startDate && endDate) {
    const start = createDateTime(startDate)
    const end = createEndDateOnly(endDate)
    if (start && end) {
      return [{ updated_date_n_time: { $gte: new Date(start), $lte: new Date(end) } }]
    }
    return []
  }
  if (dateRange === 2) {
    const range = startAndEndOfWeek()
    if (range) {
      return [{ updated_date_n_time: { $gte: new Date(range.start_date), $lte: new Date(range.end_date) } }]
    }
    return []
  }
  if (dateRange === 3) {
    const range = monthStartEndDate()
    if (range) {
      return [{ updated_date_n_time: { $gte: new Date(range.start_date), $lte: new Date(range.end_date) } }]
    }
    return []
  }
  return []
}

/** "Registered users" tab (type===1) - one flat $facet, data + count in a single aggregate call
 * (this migration's own established fix for the legacy pattern of 2 separate calls). */
export function buildRegisteredUsersPipeline(matchQuery: Record<string, unknown>[], skip: number, limit: number) {
  return [
    { $match: { $and: matchQuery } },
    {
      $facet: {
        data: [
          { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
          { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              count: 1,
              updated_date_n_time: 1,
              user_name: '$user_info.user_name',
              full_name: '$user_info.full_name',
              email_id: '$user_info.email_id',
              login_status: '$user_info.login_status',
              approval_status: '$user_info.approval_status',
            },
          },
          { $skip: skip },
          { $limit: limit },
        ],
        countPrep: [{ $count: 'count' }],
      },
    },
  ]
}

/**
 * "Created Events" tab (type!==1) - starts from the ONE location doc matched by `_id`, joins
 * every event sharing its city/state/country, then unwinds to one row per matching event. Ported
 * verbatim from event.js:12840-12973 (2 separate aggregate calls there); consolidated into one
 * $facet here, same fix as the Registered Users branch above.
 */
export function buildCreatedEventsPipeline(locationRowId: number, dateMatch: Record<string, unknown>[], skip: number, limit: number) {
  const eventLookupPipeline = [
    { $lookup: { from: 'cln_static_countries', localField: 'contact_country_row_id', foreignField: '_id', as: 'country_info' } },
    { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
    { $set: { country_name: '$country_info.country_name' } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    { $match: { $expr: { $and: [{ $eq: ['$event_city', '$$city'] }, { $eq: ['$event_state', '$$state'] }, { $eq: ['$country_info.country_name', '$$country'] }] } } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        event_title: 1,
        event_image: 1,
        event_city: 1,
        event_venue: 1,
        event_url: 1,
        start_date: 1,
        end_date: 1,
        active_status: 1,
        approval_status: 1,
        list_event_type: 1,
        created_date_n_time: 1,
        created_by_admin_status: 1,
        created_by_sub_admin_id: 1,
        utc_time: '$utc_dates.utc_time',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        company_id: '$company_info.company_id',
        company_name: '$company_info.company_name',
      },
    },
  ]

  const sharedStages = [
    { $match: { _id: locationRowId } },
    { $lookup: { from: 'cln_events', let: { city: '$city', state: '$state', country: '$country' }, pipeline: eventLookupPipeline, as: 'event_info' } },
    { $unwind: { path: '$event_info', preserveNullAndEmptyArrays: true } },
    { $set: { updated_date_n_time: '$event_info.created_date_n_time' } },
    // Ported verbatim from event.js:12940-12946 - filters out the "no matching event" row unwind
    // leaves behind (preserveNullAndEmptyArrays:true keeps it as event_info: undefined/[]).
    { $match: { $and: [{ event_info: { $exists: true, $ne: [] } }, ...dateMatch] } },
    {
      $project: {
        event_title: '$event_info.event_title',
        event_image: '$event_info.event_image',
        event_city: '$event_info.event_city',
        event_venue: '$event_info.event_venue',
        event_url: '$event_info.event_url',
        start_date: '$event_info.start_date',
        end_date: '$event_info.end_date',
        list_event_type: '$event_info.list_event_type',
        active_status: '$event_info.active_status',
        approval_status: '$event_info.approval_status',
        created_date_n_time: '$event_info.created_date_n_time',
        created_by_admin_status: '$event_info.created_by_admin_status',
        created_by_sub_admin_id: '$event_info.created_by_sub_admin_id',
        utc_time: '$event_info.utc_time',
        full_name: '$event_info.full_name',
        email_id: '$event_info.email_id',
        company_id: '$event_info.company_id',
        company_name: '$event_info.company_name',
      },
    },
  ]

  return [
    ...sharedStages,
    {
      $facet: {
        data: [{ $sort: { created_date_n_time: -1 as const } }, { $skip: skip }, { $limit: limit }],
        countPrep: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractFacetListResult<T>(aggregateOutput: { data: T[]; countPrep: { count: number }[] }[]): { data: T[]; count: number } {
  const facet = aggregateOutput[0] || { data: [], countPrep: [] }
  return { data: facet.data, count: facet.countPrep?.[0]?.count ?? 0 }
}
