// modules/events-organisers/events-organisers.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /host_list (3506), GET /host_view (3681),
// GET /admin_organizers_list (3977), GET /admin_organizers_view (4105).
//
// CONFIRMED PERF FIX (host_list, admin_organizers_list): both legacy routes ran the SAME
// $match/$lookup pipeline TWICE — once via `.aggregate(...).skip(skip).limit(limit)` for the
// page of data, once again as a fully separate `count_query` aggregate just for the total count
// — the classic two-round-trips-for-one-page-load bug. Mongoose's `.skip()/.limit()` on an
// aggregate also just appends stages to the END of the pipeline, so the lookups ran over the
// FULL matched set before paginating, in both aggregate calls. Fixed here: one $facet call per
// route, base $match/$lookup stages shared once, $skip/$limit moved into the `data` branch.
export function buildHostListPipeline({ searchQuery, skip, limit }: { searchQuery: Record<string, unknown>; skip: number; limit: number }) {
  // Order matters: searchQuery can match on company_name/company_email_id/company_id, which only
  // exist on the document AFTER the $addFields below runs (they're aliases of company_info.*) —
  // ported in this exact order, not reshuffled, to keep company-name search working.
  const sharedStages = [
    { $match: { login_status: 1, approval_status: 1 } },
    { $lookup: { from: 'cln_events', localField: '_id', foreignField: 'user_row_id', as: 'event_info', pipeline: [{ $match: {} }, { $group: { _id: null, count: { $sum: 1 } } }] } },
    { $unwind: { path: '$event_info' } },
    { $lookup: { from: 'cln_company_lists', localField: '_id', foreignField: 'user_row_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $addFields: { company_name: '$company_info.company_name', company_email_id: '$company_info.company_email_id', company_id: '$company_info.company_id', company_active_status: '$company_info.active_status' } },
    { $match: searchQuery },
  ]
  return [
    ...sharedStages,
    {
      $facet: {
        data: [
          { $set: { total_events: '$event_info.count' } },
          { $sort: { total_events: -1 as const } },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              user_name: 1,
              full_name: 1,
              email_id: 1,
              profile_image: '$img_info.profile_image',
              company_logo: '$company_info.company_logo',
              company_name: 1,
              company_email_id: 1,
              company_id: 1,
              company_active_status: 1,
              pro_batch: 1,
              total_events: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function buildHostViewPipeline(query: Record<string, unknown>[]) {
  return [
    { $match: { $and: query } },
    { $sort: { start_date: -1 as const } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        event_title: 1,
        event_url: 1,
        list_event_type: 1,
        active_status: 1,
        start_date: 1,
        end_date: 1,
        event_type: 1,
        event_image: 1,
        event_price: 1,
        approval_status: 1,
        utc_time: '$utc_dates.utc_time',
      },
    },
  ]
}

export function buildAdminOrganizersListPipeline({ searchQuery, skip, limit }: { searchQuery: Record<string, unknown>; skip: number; limit: number }) {
  const sharedStages = [
    { $match: { $or: [{ user_row_id: null }, { user_row_id: 0 }] } },
    { $lookup: { from: 'cln_events', localField: '_id', foreignField: 'company_row_id', as: 'event_info', pipeline: [{ $match: { _id: { $exists: true } } }, { $project: { _id: 1 } }] } },
    { $set: { total_events: { $size: '$event_info' } } },
    { $match: searchQuery },
  ]
  return [
    ...sharedStages,
    {
      $facet: {
        data: [
          { $sort: { total_events: -1 as const } },
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 1, user_row_id: 1, company_name: 1, company_id: 1, company_email_id: 1, company_logo: 1, total_events: 1 } },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function buildAdminOrganizersViewPipeline(companyRowId: number, eventFilterQuery: Record<string, unknown>[]) {
  return [
    { $match: { _id: companyRowId } },
    { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'main_business_info' } },
    { $lookup: { from: 'cln_static_company_business_models', localField: 'business_model_id', foreignField: '_id', as: 'business_model_info' } },
    {
      $lookup: {
        from: 'cln_events',
        localField: '_id',
        foreignField: 'company_row_id',
        as: 'event_info',
        pipeline: [
          { $match: { $and: eventFilterQuery } },
          { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
          { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
          { $project: { event_title: 1, event_url: 1, list_event_type: 1, active_status: 1, start_date: 1, end_date: 1, event_type: 1, event_image: 1, event_price: 1, approval_status: 1, utc_time: '$utc_dates.utc_time' } },
          { $sort: { start_date: -1 } },
        ],
      },
    },
    {
      $project: {
        _id: 1,
        company_id: 1,
        company_name: 1,
        company_email_id: 1,
        company_location: 1,
        established_in: 1,
        website_link: 1,
        event_info: '$event_info',
        main_business_model_name: '$main_business_info.business_name',
        business_model_name: '$business_model_info.business_name',
        count: { $size: '$event_info' },
      },
    },
  ]
}

export function extractFacetResult(aggregateOutput: any[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, count: facetResult.totalCount?.[0]?.count ?? 0 }
}
