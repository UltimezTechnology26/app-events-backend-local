// modules/events-location/events-location.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /searched_locations (12677) — backs the
// "Location List" admin menu page.
//
// CONFIRMED PERF FIX: the legacy pipeline ran its $lookup (joining cln_events to compute
// event_count/country_name/etc for every row) BEFORE `.skip(skip).limit(limit)` (which, on an
// aggregate, just appends stages to the end) — paying the join cost across the ENTIRE matched
// set to return one page. Unlike the `list`/`deleted_events_list` routes, here the $lookup's
// output (event_count, country_name/code/flag) is never used for matching or counting — the
// `search_query` $match only filters on city/state/country fields, which exist before the
// lookup. That means the lookup can safely move to AFTER $match + $sort + $skip + $limit with no
// behavior change: it only ever needs to run on the page actually returned.
export function buildSearchedLocationsPipeline({ searchQuery, skip, limit }: { searchQuery: Record<string, unknown>; skip: number; limit: number }) {
  return [
    { $match: searchQuery },
    { $sort: { registered_users_count: -1 as const, non_registered_users_count: -1 as const, _id: -1 as const } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'cln_events',
        let: { city: '$city', state: '$state', country: '$country' },
        pipeline: [
          { $lookup: { from: 'cln_static_countries', localField: 'contact_country_row_id', foreignField: '_id', as: 'country_info' } },
          { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
          { $set: { country_name: '$country_info.country_name', country_code: '$country_info.country_code', country_flag: '$country_info.country_flag' } },
          { $match: { $expr: { $and: [{ $eq: ['$event_city', '$$city'] }, { $eq: ['$event_state', '$$state'] }, { $eq: ['$country_info.country_name', '$$country'] }] } } },
        ],
        as: 'event_info',
      },
    },
    { $set: { event_count: { $size: '$event_info' } } },
    {
      $project: {
        city: 1,
        state: 1,
        country: 1,
        registered_users_count: 1,
        non_registered_users_count: 1,
        event_count: 1,
        country_name: { $arrayElemAt: ['$event_info.country_name', 0] },
        country_code: { $arrayElemAt: ['$event_info.country_code', 0] },
        country_flag: { $arrayElemAt: ['$event_info.country_flag', 0] },
      },
    },
  ]
}
