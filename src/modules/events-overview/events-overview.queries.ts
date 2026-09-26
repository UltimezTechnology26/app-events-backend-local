// modules/events-overview/events-overview.queries.ts
//
// Ports controllers/admin_panel/events/event.js's GET /overview_details (1579), GET
// /other_details (3009), and the organizer-tag-breakdown slice of GET /tags_data (1189) - the
// "Events - Operational Data" / stacked-chart / organizer-tags sections of the legacy Events
// Overview dashboard page (admin-coinpedia/pages/events-manage/overview/index.js).
//
// CONFIRMED PERF FIX: legacy's /overview_details ran ~25 sequential `countDocuments` calls (plus
// 2 more small aggregates) over the SAME eventM collection, one per status/creator-group
// combination - a textbook "batch or join instead of looping a query per row" violation
// (CLAUDE.md). Consolidated here into ONE aggregate with a $facet branch per metric, matching the
// same "N sequential calls -> 1 facet" pattern already used throughout this migration. Every facet
// branch here is a flat [$match, $count] pipeline - NOT a nested $facet - since MongoDB rejects a
// $facet nested within another $facet stage (confirmed against real data earlier in this
// migration: `$facet is not allowed to be used within a $facet stage`, error 40600). Output values
// are unchanged from legacy - this only changes how many round-trips it takes to compute them.
//
// CONFIRMED PERF FIX (organizer tags): legacy's /tags_data ran ~15 near-identical aggregates
// against companyM/eventM, differing only by a business_model_id filter (8 = "Events" tag vs
// everything else) and a date-range condition. Consolidated into 2 flat-facet aggregates (one per
// business_model_id bucket) here - same fields, far fewer round-trips.
export const EVENTS_BUSINESS_MODEL_ID = 8

const CREATOR_GROUP_FILTERS: Record<'host' | 'organizer' | 'host_n_organizer' | 'team', Record<string, unknown>> = {
  host: { list_event_type: 1, created_by_admin_status: 0 },
  organizer: { list_event_type: 2, created_by_admin_status: 0 },
  host_n_organizer: { list_event_type: 3, created_by_admin_status: 0 },
  team: { created_by_admin_status: { $in: [1, 2] } },
}

function statusBranches(prefix: string, groupFilter: Record<string, unknown>, now: Date) {
  return {
    [`${prefix}_pending`]: [{ $match: { ...groupFilter, approval_status: 0, active_status: 1 } }, { $count: 'count' }],
    [`${prefix}_approved`]: [{ $match: { ...groupFilter, approval_status: 1, active_status: 1 } }, { $count: 'count' }],
    [`${prefix}_rejected`]: [{ $match: { ...groupFilter, approval_status: 2, active_status: 1 } }, { $count: 'count' }],
    [`${prefix}_disabled`]: [{ $match: { ...groupFilter, approval_status: 1, active_status: 0 } }, { $count: 'count' }],
    [`${prefix}_ongoing`]: [{ $match: { ...groupFilter, active_status: 1, approval_status: 1, start_date: { $lte: now }, end_date: { $gte: now } } }, { $count: 'count' }],
    [`${prefix}_upcoming`]: [{ $match: { ...groupFilter, active_status: 1, approval_status: 1, start_date: { $gte: now } } }, { $count: 'count' }],
    [`${prefix}_ended`]: [{ $match: { ...groupFilter, active_status: 1, approval_status: 1, end_date: { $lt: now } } }, { $count: 'count' }],
  }
}

/** ONE flat $facet - every branch is [$match, $count], no nested facets. Covers global totals
 * plus all 4 creator-group breakdowns (host/organizer/host_n_organizer/team) in a single
 * aggregate call over eventM. */
export function buildEventsOverviewPipeline({ dateMatch, now }: { dateMatch: Record<string, unknown>; now: Date }) {
  return [
    { $match: dateMatch },
    {
      $facet: {
        pending: [{ $match: { approval_status: 0, active_status: 1 } }, { $count: 'count' }],
        approved: [{ $match: { approval_status: 1, active_status: 1 } }, { $count: 'count' }],
        rejected: [{ $match: { approval_status: 2, active_status: 1 } }, { $count: 'count' }],
        disabled: [
          {
            $match: {
              active_status: 0,
              approval_status: 1,
              $or: [{ created_by_admin_status: { $ne: 0 } }, { created_by_admin_status: 0, list_event_type: { $in: [1, 2, 3] } }],
            },
          },
          { $count: 'count' },
        ],
        ongoing: [{ $match: { active_status: 1, approval_status: 1, start_date: { $lte: now }, end_date: { $gte: now } } }, { $count: 'count' }],
        upcoming: [{ $match: { active_status: 1, approval_status: 1, start_date: { $gte: now } } }, { $count: 'count' }],
        completed: [{ $match: { active_status: 1, approval_status: 1, end_date: { $lt: now } } }, { $count: 'count' }],
        ...statusBranches('host', CREATOR_GROUP_FILTERS.host, now),
        ...statusBranches('organizer', CREATOR_GROUP_FILTERS.organizer, now),
        ...statusBranches('host_n_organizer', CREATOR_GROUP_FILTERS.host_n_organizer, now),
        ...statusBranches('team', CREATOR_GROUP_FILTERS.team, now),
      },
    },
  ]
}

/** Ports /other_details's admin-vs-user ongoing/upcoming/ended split (feeds the stacked-column
 * growth chart) - same 6 sequential countDocuments consolidated into 1 flat facet. */
export function buildOwnerTypeBreakdownPipeline({ dateMatch, now }: { dateMatch: Record<string, unknown>; now: Date }) {
  const activeOrDisabled = { $or: [{ active_status: 1, approval_status: 1 }, { active_status: 0, approval_status: 1 }] }
  return [
    { $match: dateMatch },
    {
      $facet: {
        ongoing_admin: [{ $match: { created_by_admin_status: { $in: [1, 2] }, start_date: { $lte: now }, end_date: { $gte: now }, ...activeOrDisabled } }, { $count: 'count' }],
        ongoing_user: [{ $match: { created_by_admin_status: 0, start_date: { $lte: now }, end_date: { $gte: now }, ...activeOrDisabled } }, { $count: 'count' }],
        upcoming_admin: [{ $match: { created_by_admin_status: { $in: [1, 2] }, start_date: { $gte: now }, ...activeOrDisabled } }, { $count: 'count' }],
        upcoming_user: [{ $match: { created_by_admin_status: 0, start_date: { $gte: now }, ...activeOrDisabled } }, { $count: 'count' }],
        ended_admin: [{ $match: { created_by_admin_status: { $in: [1, 2] }, end_date: { $lt: now }, ...activeOrDisabled } }, { $count: 'count' }],
        ended_user: [{ $match: { created_by_admin_status: 0, end_date: { $lt: now }, ...activeOrDisabled } }, { $count: 'count' }],
      },
    },
  ]
}

/** Deleted events live in a SEPARATE collection (deleted_eventsM) from active/pending/etc events,
 * so this needs its own aggregate call (a $facet can't span two collections) - one flat facet
 * covering the global total plus all 4 creator-group deleted counts. */
export function buildDeletedEventsBreakdownPipeline(dateMatch: Record<string, unknown>) {
  return [
    { $match: dateMatch },
    {
      $facet: {
        total: [{ $count: 'count' }],
        host: [{ $match: CREATOR_GROUP_FILTERS.host }, { $count: 'count' }],
        organizer: [{ $match: CREATOR_GROUP_FILTERS.organizer }, { $count: 'count' }],
        host_n_organizer: [{ $match: CREATOR_GROUP_FILTERS.host_n_organizer }, { $count: 'count' }],
        team: [{ $match: CREATOR_GROUP_FILTERS.team }, { $count: 'count' }],
      },
    },
  ]
}

/** Ports /tags_data's organizer-tag-breakdown slice for ONE business_model_id bucket (call twice:
 * once with EVENTS_BUSINESS_MODEL_ID, once with its $ne complement) - runs against companyM. */
export function buildOrganizerTagBreakdownPipeline(businessModelMatch: Record<string, unknown>) {
  return [
    {
      $facet: {
        total_organizers: [{ $match: { ...businessModelMatch, active_status: 1 } }, { $count: 'count' }],
        pending: [{ $match: { ...businessModelMatch, approval_status: 0, active_status: 1 } }, { $count: 'count' }],
        approved: [{ $match: { ...businessModelMatch, approval_status: 1, active_status: 1 } }, { $count: 'count' }],
      },
    },
  ]
}

/** Ported verbatim from /overview's `employees_events_reports` aggregate (event.js:1984) - the
 * "All Employee Report" table's data source. */
export function buildEmployeesEventsReportsPipeline(dateMatch: Record<string, unknown>) {
  return [
    { $match: { ...dateMatch, created_by_admin_status: 2, created_by_sub_admin_id: { $gt: 0 }, active_status: 1 } },
    { $group: { _id: '$created_by_sub_admin_id', events_created: { $sum: 1 } } },
    {
      $lookup: {
        from: 'cln_sub_admins',
        localField: '_id',
        foreignField: '_id',
        as: 'subadmin_info',
        pipeline: [
          { $lookup: { from: 'cln_company_lists', localField: '_id', foreignField: 'sub_admin_row_id', as: 'company_info', pipeline: [{ $project: { _id: 1 } }] } },
          { $lookup: { from: 'cln_professionals', localField: '_id', foreignField: 'sub_admin_row_id', as: 'user_info', pipeline: [{ $project: { _id: 1 } }] } },
          { $project: { full_name: 1, email_id: 1, total_company: { $size: '$company_info' }, total_user: { $size: '$user_info' } } },
        ],
      },
    },
    { $unwind: { path: '$subadmin_info', preserveNullAndEmptyArrays: true } },
    { $sort: { events_created: -1 as const } },
    {
      $project: {
        _id: 1,
        events_created: 1,
        full_name: '$subadmin_info.full_name',
        email_id: '$subadmin_info.email_id',
        total_user: '$subadmin_info.total_user',
        total_company: '$subadmin_info.total_company',
      },
    },
  ]
}

export function extractFacetCount(branch: unknown): number {
  const rows = branch as { count?: number }[] | undefined
  return rows?.[0]?.count ?? 0
}
