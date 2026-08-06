// modules/company_admin/company_admin.queries.ts

/** Ports company.js's company_events_list's "created by this company" branch (lines 55-84). */
export function buildCompanyEventsCreatedPipeline({ companyRowId }: { companyRowId: number }) {
  return [
    { $match: { company_row_id: companyRowId, list_event_type: { $in: [2, 3] } } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        event_title: 1,
        event_type: 1,
        event_image: 1,
        event_url: 1,
        event_image_type: 1,
        start_date: 1,
        end_date: 1,
        active_status: 1,
        approval_status: 1,
        list_event_type: 1,
        utc_time: '$utc_dates.utc_time',
      },
    },
  ]
}

/** Ports company.js's company_events_list's "sponsored by this company" branch (lines 86-150). */
export function buildCompanyEventsSponsoredPipeline({ companyRowId }: { companyRowId: number }) {
  return [
    { $match: { account_type: 2, registered_type: 1, user_company_row_id: companyRowId } },
    {
      $lookup: {
        from: 'cln_events',
        localField: 'event_row_id',
        foreignField: '_id',
        as: 'event_info',
        pipeline: [
          { $match: { _id: { $exists: true } } },
          { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
          { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              event_title: 1,
              event_type: 1,
              event_image: 1,
              event_url: 1,
              event_image_type: 1,
              start_date: 1,
              end_date: 1,
              active_status: 1,
              approval_status: 1,
              list_event_type: 1,
              utc_time: '$utc_dates.utc_time',
            },
          },
        ],
      },
    },
    { $unwind: { path: '$event_info', preserveNullAndEmptyArrays: true } },
    { $match: { 'event_info._id': { $exists: true } } },
    {
      $project: {
        sponsor_partner_type: 1,
        sponsorship_type_title: 1,
        event_title: '$event_info.event_title',
        event_type: '$event_info.event_type',
        event_image: '$event_info.event_image',
        event_url: '$event_info.event_url',
        event_image_type: '$event_info.event_image_type',
        start_date: '$event_info.start_date',
        end_date: '$event_info.end_date',
        active_status: '$event_info.active_status',
        approval_status: '$event_info.approval_status',
        list_event_type: '$event_info.list_event_type',
        utc_time: '$event_info.utc_time',
      },
    },
  ]
}

/**
 * Ports company.js's subadmin_overview (lines 2218-2269).
 *
 * CONFIRMED BUG FIX: the real source's $lookup used `foreignField: "created_admin_row_id"` —
 * a field that does not exist anywhere on companyM's schema (confirmed via the model file; only
 * `sub_admin_row_id`/`approval_sub_admin_row_id` exist). This meant the lookup never matched
 * anything, so `total_company` was silently an empty array for every sub-admin, always. Fixed to
 * the real field name, `sub_admin_row_id` (the field every admin-created-company write path,
 * e.g. create_company_details/update_basic_company_details, actually sets).
 */
export function buildSubadminOverviewPipeline() {
  return [
    { $match: { login_status: 1, create_type_row_id: 7 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: '_id',
        foreignField: 'sub_admin_row_id',
        pipeline: [{ $project: { _id: 1, approval_status: 1 } }],
        as: 'info_company',
      },
    },
    { $project: { _id: 1, full_name: 1, email_id: 1, total_company: '$info_company', date_n_time: 1 } },
  ]
}
