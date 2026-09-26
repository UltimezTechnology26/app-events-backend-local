// modules/events/events.published-overview.queries.ts
//
// Ports the 3 "Published Events" summary-card aggregates from controllers/admin_panel/events/
// event.js's GET /overview (event.js:2258-2407) — "Total Events" / "Events Created by our Team"
// (created_by_admin_status in [1,2]) / "Events Created Through the User Panel"
// (created_by_admin_status = 0), each broken down into total/ongoing/upcoming/ended. Legacy ran
// these as 3 SEPARATE aggregate calls sharing the same base $match ({active_status:1,
// approval_status:1}) run 3 times; consolidated here into ONE aggregate with a single flat
// $facet (12 named branches, none nested — MongoDB rejects $facet-in-$facet, error 40600, this
// migration's own previously-confirmed constraint) so the base $match runs once.
function dateRangeBranch(extraMatch: Record<string, unknown>, presentTime: string) {
  const now = new Date(presentTime)
  return {
    total: [{ $match: extraMatch }, { $count: 'count' }],
    ongoing: [{ $match: { ...extraMatch, start_date: { $lte: now }, end_date: { $gte: now } } }, { $count: 'count' }],
    upcoming: [{ $match: { ...extraMatch, start_date: { $gt: now } } }, { $count: 'count' }],
    ended: [{ $match: { ...extraMatch, end_date: { $lt: now } } }, { $count: 'count' }],
  }
}

export function buildPublishedOverviewPipeline(presentTime: string) {
  const totalBranches = dateRangeBranch({}, presentTime)
  const userBranches = dateRangeBranch({ created_by_admin_status: 0 }, presentTime)
  const adminBranches = dateRangeBranch({ created_by_admin_status: { $in: [1, 2] } }, presentTime)

  return [
    { $match: { active_status: 1, approval_status: 1 } },
    {
      $facet: {
        total_total: totalBranches.total,
        total_ongoing: totalBranches.ongoing,
        total_upcoming: totalBranches.upcoming,
        total_ended: totalBranches.ended,
        user_total: userBranches.total,
        user_ongoing: userBranches.ongoing,
        user_upcoming: userBranches.upcoming,
        user_ended: userBranches.ended,
        admin_total: adminBranches.total,
        admin_ongoing: adminBranches.ongoing,
        admin_upcoming: adminBranches.upcoming,
        admin_ended: adminBranches.ended,
      },
    },
  ]
}

function extractCount(branch: { count: number }[] | undefined): number {
  return branch?.[0]?.count ?? 0
}

export function extractPublishedOverviewResult(aggregateOutput: Record<string, { count: number }[]>[]) {
  const facet = aggregateOutput[0] || {}
  return {
    published_total: extractCount(facet.total_total),
    published_ongoing: extractCount(facet.total_ongoing),
    published_upcoming: extractCount(facet.total_upcoming),
    published_ended: extractCount(facet.total_ended),
    user_events_published_total: extractCount(facet.user_total),
    user_events_published_ongoing: extractCount(facet.user_ongoing),
    user_events_published_upcoming: extractCount(facet.user_upcoming),
    user_events_published_ended: extractCount(facet.user_ended),
    admin_published_total: extractCount(facet.admin_total),
    admin_published_ongoing: extractCount(facet.admin_ongoing),
    admin_published_upcoming: extractCount(facet.admin_upcoming),
    admin_published_ended: extractCount(facet.admin_ended),
  }
}
