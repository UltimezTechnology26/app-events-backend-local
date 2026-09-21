// modules/professionals/professionals.overview.service.ts
const { getMinusYearDates, getPresentDateOnly, getMinusDates, yesterDayStartNEndDate } = require('../../../utils/helpers/helper')
import { buildYearsOverviewCountQueries, overviewCountQueries, buildClaimRequestCountAggregate, buildDeleteRequestsApprovedAggregate, buildTotalFollowersAggregate } from './professionals.overview.queries'
import { getCache, setCache, PROFESSIONALS_YEARS_OVERVIEW_KEY, PROFESSIONALS_OVERVIEW_KEY, PROFESSIONALS_OVERVIEW_TTL_SECONDS } from './professionals.cache'

/** Ports user.js's GET /years_overview (~line 326-390) verbatim — already Promise.all'd in the real route, unchanged here besides relocation + caching. */
export async function getYearsOverview() {
  const cached = await getCache({ key: PROFESSIONALS_YEARS_OVERVIEW_KEY })
  if (cached.status) return cached.message

  const years = [0, 1, 2, 3].map((i) => getMinusYearDates(i))
  const [presentYear, oneYearBack, twoYearBack, threeYearBack] = years

  const present = buildYearsOverviewCountQueries(presentYear)
  const oneBack = buildYearsOverviewCountQueries(oneYearBack)
  const twoBack = buildYearsOverviewCountQueries(twoYearBack)
  const threeBack = buildYearsOverviewCountQueries(threeYearBack)

  const [present_year, one_year_back, two_year_back, three_year_back, admin_present_year, admin_one_year_back, admin_two_year_back, admin_three_year_back] = await Promise.all([
    present.total,
    oneBack.total,
    twoBack.total,
    threeBack.total,
    present.adminCreated,
    oneBack.adminCreated,
    twoBack.adminCreated,
    threeBack.adminCreated,
  ])

  const result = {
    present_year: presentYear,
    one_year: oneYearBack,
    two_year: twoYearBack,
    three_year: threeYearBack,
    all_present_year: present_year,
    all_one_year_back: one_year_back,
    all_two_year_back: two_year_back,
    all_three_year_back: three_year_back,
    admin_present_year,
    admin_one_year_back,
    admin_two_year_back,
    admin_three_year_back,
    user_present_year: present_year - admin_present_year,
    user_one_year_back: one_year_back - admin_one_year_back,
    user_two_year_back: two_year_back - admin_two_year_back,
    user_three_year_back: three_year_back - admin_three_year_back,
  }

  const response = { status: true, message: result }
  await setCache({ key: PROFESSIONALS_YEARS_OVERVIEW_KEY, value: response, ttl: PROFESSIONALS_OVERVIEW_TTL_SECONDS })
  return response
}

/**
 * Ports user.js's GET /overview (~line 466-776). Field names/values are ported verbatim; the
 * only structural change is running every independent count as one Promise.all batch instead of
 * the real route's mix of two Promise.all blocks followed by ~9 sequential `await` calls at the
 * end (self_registered fields, delete_requests fields, total_created_users, total_enabled_users,
 * total_disabled_users) — none of those trailing counts depend on each other or on anything
 * computed in between, so batching them removes ~9 redundant network round-trips per call. No
 * value or field changes.
 *
 * CONFIRMED ACCESS-CONTROL BUG (flagged, not silently fixed): the real /overview route has NO
 * checkAdminLoginToken call at all — unlike every sibling route in this file, it is reachable by
 * anyone who can reach the API (only the global checkApiKey gate applies). This new module's
 * controller gates it with checkAdminLoginToken([1]), matching the plan's confirmed
 * "normalize Phase A routes to permission id [1]" decision and closing this gap — see the
 * controller's route comment and the final report for this phase.
 */
export async function getOverview() {
  const cached = await getCache({ key: PROFESSIONALS_OVERVIEW_KEY })
  if (cached.status) return cached.message

  const today_date = getPresentDateOnly()
  const { start_date, end_date } = yesterDayStartNEndDate(1)
  const week_date = getMinusDates(7)
  const one_month_date = getMinusDates(30)

  const [
    created_total_pending,
    created_total_approved,
    created_total_disabled,
    created_total_rejected,
    created_total_deleted,
    created_sub_admin_total_pending,
    created_sub_admin_total_approved,
    created_sub_admin_total_disabled,
    created_sub_admin_total_rejected,
    total_public,
    total_private,
    total_pending_manual,
    total_approved_manual,
    total_reject_manual,
    admin_total_pending,
    admin_total_approved,
    admin_total_disabled,
    admin_total_rejected,
    today_total_claim_pending,
    today_total_claim_approved,
    today_total_claim_disabled,
    yesterday_claim_total_pending,
    yesterday_claim_total_approved,
    yesterday_claim_total_disabled,
    week_total_claim_pending,
    week_total_claim_approved,
    week_total_claim_disabled,
    month_total_claim_pending,
    month_total_claim_approved,
    month_total_claim_disabled,
    self_registered_pending,
    self_registered_approved,
    self_registered_rejected,
    claim_pending_agg,
    claim_approved_agg,
    claim_rejected_agg,
    delete_requests_pending,
    delete_requests_approved_agg,
    delete_requests_rejected,
    total_created_users,
    total_enabled_users,
    total_disabled_users,
    total_followers_agg,
  ] = await Promise.all([
    overviewCountQueries.createdTotalPending(),
    overviewCountQueries.createdTotalApproved(),
    overviewCountQueries.createdTotalDisabled(),
    overviewCountQueries.createdTotalRejected(),
    overviewCountQueries.createdTotalDeleted(),
    overviewCountQueries.createdSubAdminTotalPending(),
    overviewCountQueries.createdSubAdminTotalApproved(),
    overviewCountQueries.createdSubAdminTotalDisabled(),
    overviewCountQueries.createdSubAdminTotalRejected(),
    overviewCountQueries.totalPublic(),
    overviewCountQueries.totalPrivate(),
    overviewCountQueries.totalPendingManual(),
    overviewCountQueries.totalApprovedManual(),
    overviewCountQueries.totalRejectManual(),
    overviewCountQueries.adminTotalPending(),
    overviewCountQueries.adminTotalApproved(),
    overviewCountQueries.adminTotalDisabled(),
    overviewCountQueries.adminTotalRejected(),
    overviewCountQueries.claimByStatusCount(1, { $gte: new Date(today_date) }),
    overviewCountQueries.claimByStatusCount(2, { $gte: new Date(today_date) }),
    overviewCountQueries.claimByStatusCount(3, { $gte: new Date(today_date) }),
    overviewCountQueries.claimByStatusCount(1, { $gte: new Date(start_date), $lte: new Date(end_date) }),
    overviewCountQueries.claimByStatusCount(2, { $gte: new Date(start_date), $lte: new Date(end_date) }),
    overviewCountQueries.claimByStatusCount(3, { $gte: new Date(start_date), $lte: new Date(end_date) }),
    overviewCountQueries.claimByStatusCount(1, { $gte: new Date(week_date) }),
    overviewCountQueries.claimByStatusCount(2, { $gte: new Date(week_date) }),
    overviewCountQueries.claimByStatusCount(3, { $gte: new Date(week_date) }),
    overviewCountQueries.claimByStatusCount(1, { $gte: new Date(one_month_date) }),
    overviewCountQueries.claimByStatusCount(2, { $gte: new Date(one_month_date) }),
    overviewCountQueries.claimByStatusCount(3, { $gte: new Date(one_month_date) }),
    overviewCountQueries.createdTotalPending(),
    overviewCountQueries.createdTotalApproved(),
    overviewCountQueries.createdTotalRejected(),
    buildClaimRequestCountAggregate(1),
    buildClaimRequestCountAggregate(2),
    buildClaimRequestCountAggregate(3),
    overviewCountQueries.deleteRequestsPending(),
    buildDeleteRequestsApprovedAggregate(),
    overviewCountQueries.deleteRequestsRejected(),
    overviewCountQueries.totalCreatedUsers(),
    overviewCountQueries.totalEnabledUsers(),
    overviewCountQueries.totalDisabledUsers(),
    buildTotalFollowersAggregate(),
  ])

  const result: Record<string, unknown> = {}
  result.total_pending = created_total_pending
  result.total_approved = created_total_approved
  result.total_disabled = created_total_disabled
  result.total_rejected = created_total_rejected
  result.total_deleted = created_total_deleted

  result.admin_total_pending = admin_total_pending - created_sub_admin_total_pending
  result.admin_total_approved = admin_total_approved - created_sub_admin_total_approved
  result.admin_total_disabled = admin_total_disabled - created_sub_admin_total_disabled
  result.admin_total_rejected = admin_total_rejected - created_sub_admin_total_rejected

  result.user_total_pending = created_total_pending - admin_total_pending
  result.user_total_approved = created_total_approved - admin_total_approved
  result.user_total_disabled = created_total_disabled - admin_total_disabled
  result.user_total_rejected = created_total_rejected - admin_total_rejected

  result.created_sub_admin_total_pending = created_sub_admin_total_pending
  result.created_sub_admin_total_approved = created_sub_admin_total_approved
  result.created_sub_admin_total_disabled = created_sub_admin_total_disabled
  result.created_sub_admin_total_rejected = created_sub_admin_total_rejected

  result.total_public = total_public
  result.total_private = total_private

  result.total_pending_manual_retrievals = total_pending_manual
  result.total_approved_manual_retrievals = total_approved_manual
  result.total_reject_manual_retrievals = total_reject_manual

  result.today_total_claim_pending = today_total_claim_pending
  result.today_total_claim_approved = today_total_claim_approved
  result.today_total_claim_rejected = today_total_claim_disabled

  result.yesterday_claim_total_pending = yesterday_claim_total_pending
  result.yesterday_claim_total_approved = yesterday_claim_total_approved
  result.yesterday_claim_total_rejected = yesterday_claim_total_disabled

  result.week_total_claim_pending = week_total_claim_pending
  result.week_total_claim_approved = week_total_claim_approved
  result.week_total_claim_rejected = week_total_claim_disabled

  result.month_total_claim_pending = month_total_claim_pending
  result.month_total_claim_approved = month_total_claim_approved
  result.month_total_claim_rejected = month_total_claim_disabled

  result.self_registered_pending = self_registered_pending
  result.self_registered_approved = self_registered_approved
  result.self_registered_rejected = self_registered_rejected

  result.claim_request_pending = claim_pending_agg[0]?.count ?? 0
  result.claim_request_approved = claim_approved_agg[0]?.count ?? 0
  result.claim_request_rejected = claim_rejected_agg[0]?.count ?? 0

  result.delete_requests_pending = delete_requests_pending
  result.delete_requests_approved = delete_requests_approved_agg[0]?.count ?? 0
  result.delete_requests_rejected = delete_requests_rejected

  result.total_created_users = total_created_users
  result.total_enabled_users = total_enabled_users
  result.total_disabled_users = total_disabled_users
  result.total_followers_count = total_followers_agg[0]?.count ?? 0

  const response = { status: true, message: result }
  await setCache({ key: PROFESSIONALS_OVERVIEW_KEY, value: response, ttl: PROFESSIONALS_OVERVIEW_TTL_SECONDS })
  return response
}
