// modules/company_admin/company_admin.overview.service.ts
const companyM = require('../../../models/app/company/companyM')
const company_deleted_historyM = require('../../../models/app/company/company_deleted_historyM')
const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const company_claim_requestsM = require('../../../models/app/company/company_claim_requestsM')
const eventM = require('../../../models/app/events/eventM')
const { getPresentDateTime, getPresentDateOnly, yesterDayStartNEndDate, getMinusDates } = require('../../../utils/helpers/helper')
import { getVerifiedInvestorCount } from '../funding/funding.service'
import { getPartnerDashboardStats } from '../partners/partners.service'
import { getEmployeeRequestCounts } from '../work-experience/work-experience.service'
import {
  buildLiveCompanyEventsCountPipeline,
  buildEventOngoingCountPipeline,
  buildEventUpcomingCountPipeline,
  buildEventCompletedCountPipeline,
  buildUserClaimCountPipeline,
  buildTotalPendingFilter,
  buildTotalApprovedFilter,
  buildTotalDisabledFilter,
  buildTotalRejectedFilter,
  buildBulkUploadPendingFilter,
  buildBulkUploadApprovedFilter,
  buildBulkUploadDisabledFilter,
  buildBulkUploadRejectedFilter,
  buildSubAdminCreatedPendingFilter,
  buildSubAdminCreatedApprovedFilter,
  buildSubAdminCreatedDisabledFilter,
  buildSubAdminCreatedRejectedFilter,
  buildSubAdminCreatedDeletedFilter,
  buildAdminCreatedPendingFilter,
  buildAdminCreatedApprovedFilter,
  buildAdminCreatedDisabledFilter,
  buildAdminCreatedRejectedFilter,
  buildAdminCreatedDeletedFilter,
  buildManualRetrievalsCountFilter,
  buildClaimStatsCountFilter,
  buildTotalAdminCreatedFilter,
  buildCompanyStatusBreakdownFilter,
} from './company_admin.overview.queries'

async function countFirst(aggregatePromise: Promise<{ count?: number }[]>): Promise<number> {
  const rows = await aggregatePromise
  return rows[0]?.count ?? 0
}

/** All ~50 numeric stats getCompanyOverview() assembles into its response. */
export type CompanyOverviewResult = Record<string, number>

/**
 * Merges company.js's GET /company_overview (checkApiKey only, 120s cache) and GET /overview
 * (checkAdminLoginToken [7], no cache) into one canonical implementation (Part 3 §7 Phase H.3).
 * Both routes now require admin login (user-confirmed) and neither caches — the real caller
 * (admin-coinpedia's `/companies/overview` page) fetches server-side once per page load and
 * never reads a cache-status field, so a 120s cache buys nothing on the only live call site.
 *
 * Delegates partner counts to modules/partners/, investor counts to modules/funding/, and
 * employee/work-experience counts to modules/work-experience/, per the domain-delegation
 * architecture decided for Phase H.
 *
 * CONFIRMED BUG FIX: the real `overview` source computed
 * `user_total_deleted = total_deleted - created_total_rejected`, breaking the pattern every
 * sibling field follows (`user_total_X = total_X - created_total_X`). Fixed to
 * `total_deleted - created_total_deleted`.
 */
export async function getCompanyOverview() {
  const result: CompanyOverviewResult = {}
  // getPresentDateTime() returns a formatted string, not a Date — the real source always wraps
  // it in `new Date(...)` at each match-stage usage site before comparing against Date-typed
  // schema fields; a Date field compared against a plain string never matches in MongoDB (BSON
  // sorts Date after String), which would silently zero out every ongoing/upcoming/completed count.
  const present_date_n_time = new Date(getPresentDateTime())

  const total_pending_query = companyM.countDocuments(buildTotalPendingFilter())
  const total_approved_query = companyM.countDocuments(buildTotalApprovedFilter())
  const total_disabled_query = companyM.countDocuments(buildTotalDisabledFilter())
  const total_rejected_query = companyM.countDocuments(buildTotalRejectedFilter())
  const total_deleted_query = company_deleted_historyM.countDocuments()

  const total_bulk_upload_pending_query = companyM.countDocuments(buildBulkUploadPendingFilter())
  const total_bulk_upload_approved_query = companyM.countDocuments(buildBulkUploadApprovedFilter())
  const total_bulk_upload_disabled_query = companyM.countDocuments(buildBulkUploadDisabledFilter())
  const total_bulk_upload_rejected_query = companyM.countDocuments(buildBulkUploadRejectedFilter())

  const created_sub_admin_total_pending_query = companyM.countDocuments(buildSubAdminCreatedPendingFilter())
  const created_sub_admin_total_approved_query = companyM.countDocuments(buildSubAdminCreatedApprovedFilter())
  const created_sub_admin_total_disabled_query = companyM.countDocuments(buildSubAdminCreatedDisabledFilter())
  const created_sub_admin_total_rejected_query = companyM.countDocuments(buildSubAdminCreatedRejectedFilter())
  const created_sub_admin_total_deleted_query = company_deleted_historyM.countDocuments(buildSubAdminCreatedDeletedFilter())

  const created_total_pending_query = companyM.countDocuments(buildAdminCreatedPendingFilter())
  const created_total_approved_query = companyM.countDocuments(buildAdminCreatedApprovedFilter())
  const created_total_disabled_query = companyM.countDocuments(buildAdminCreatedDisabledFilter())
  const created_total_rejected_query = companyM.countDocuments(buildAdminCreatedRejectedFilter())
  const created_total_deleted_query = company_deleted_historyM.countDocuments(buildAdminCreatedDeletedFilter())

  const manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 0 }))
  const manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 1 }))
  const manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 2 }))

  const professional_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 0, createdFromType: 1 }))
  const professional_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 1, createdFromType: 1 }))
  const professional_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 2, createdFromType: 1 }))

  const events_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 0, createdFromType: 2 }))
  const events_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 1, createdFromType: 2 }))
  const events_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 2, createdFromType: 2 }))

  const funding_manual_retrievals_pending_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 0, createdFromType: 3 }))
  const funding_manual_retrievals_approved_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 1, createdFromType: 3 }))
  const funding_manual_retrievals_rejected_query = company_manual_retrievalsM.countDocuments(buildManualRetrievalsCountFilter({ approvalStatus: 2, createdFromType: 3 }))

  const today_date = getPresentDateOnly()
  const { start_date, end_date } = yesterDayStartNEndDate(1)
  const week_date = getMinusDates(7)
  const one_month_date = getMinusDates(30)

  const today_total_claim_pending_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 1, gte: new Date(today_date) }))
  const today_total_claim_approved_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 2, gte: new Date(today_date) }))
  const today_total_claim_disabled_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 3, gte: new Date(today_date) }))

  const yesterday_claim_total_pending_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 1, gte: new Date(start_date), lte: new Date(end_date) }))
  const yesterday_claim_total_approved_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 2, gte: new Date(start_date), lte: new Date(end_date) }))
  const yesterday_claim_total_disabled_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 3, gte: new Date(start_date), lte: new Date(end_date) }))

  const week_total_claim_pending_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 1, gte: new Date(week_date) }))
  const week_total_claim_approved_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 2, gte: new Date(week_date) }))
  const week_total_claim_disabled_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 3, gte: new Date(week_date) }))

  const month_total_claim_pending_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 1, gte: new Date(one_month_date) }))
  const month_total_claim_approved_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 2, gte: new Date(one_month_date) }))
  const month_total_claim_disabled_query = company_claim_requestsM.countDocuments(buildClaimStatsCountFilter({ claimStatus: 3, gte: new Date(one_month_date) }))

  const [
    total_pending,
    total_approved,
    total_disabled,
    total_rejected,
    total_deleted,
    created_sub_admin_total_pending,
    created_sub_admin_total_approved,
    created_sub_admin_total_disabled,
    created_sub_admin_total_rejected,
    created_sub_admin_total_deleted,
    created_total_pending,
    created_total_approved,
    created_total_disabled,
    created_total_rejected,
    created_total_deleted,
    manual_retrievals_pending,
    manual_retrievals_approved,
    manual_retrievals_rejected,
    professional_manual_retrievals_pending,
    professional_manual_retrievals_approved,
    professional_manual_retrievals_rejected,
    events_manual_retrievals_pending,
    events_manual_retrievals_approved,
    events_manual_retrievals_rejected,
    funding_manual_retrievals_pending,
    funding_manual_retrievals_approved,
    funding_manual_retrievals_rejected,
    total_bulk_upload_pending,
    total_bulk_upload_approved,
    total_bulk_upload_disabled,
    total_bulk_upload_rejected,
  ] = await Promise.all([
    total_pending_query,
    total_approved_query,
    total_disabled_query,
    total_rejected_query,
    total_deleted_query,
    created_sub_admin_total_pending_query,
    created_sub_admin_total_approved_query,
    created_sub_admin_total_disabled_query,
    created_sub_admin_total_rejected_query,
    created_sub_admin_total_deleted_query,
    created_total_pending_query,
    created_total_approved_query,
    created_total_disabled_query,
    created_total_rejected_query,
    created_total_deleted_query,
    manual_retrievals_pending_query,
    manual_retrievals_approved_query,
    manual_retrievals_rejected_query,
    professional_manual_retrievals_pending_query,
    professional_manual_retrievals_approved_query,
    professional_manual_retrievals_rejected_query,
    events_manual_retrievals_pending_query,
    events_manual_retrievals_approved_query,
    events_manual_retrievals_rejected_query,
    funding_manual_retrievals_pending_query,
    funding_manual_retrievals_approved_query,
    funding_manual_retrievals_rejected_query,
    total_bulk_upload_pending_query,
    total_bulk_upload_approved_query,
    total_bulk_upload_disabled_query,
    total_bulk_upload_rejected_query,
  ])

  result['total_pending'] = total_pending
  result['total_approved'] = total_approved
  result['total_disabled'] = total_disabled
  result['total_rejected'] = total_rejected
  result['total_deleted'] = total_deleted

  result['created_sub_admin_total_pending'] = created_sub_admin_total_pending
  result['created_sub_admin_total_approved'] = created_sub_admin_total_approved
  result['created_sub_admin_total_disabled'] = created_sub_admin_total_disabled
  result['created_sub_admin_total_rejected'] = created_sub_admin_total_rejected
  result['created_sub_admin_total_deleted'] = created_sub_admin_total_deleted

  result['created_admin_total_pending'] = created_total_pending - created_sub_admin_total_pending
  result['created_admin_total_approved'] = created_total_approved - created_sub_admin_total_approved
  result['created_admin_total_disabled'] = created_total_disabled - created_sub_admin_total_disabled
  result['created_admin_total_rejected'] = created_total_rejected - created_sub_admin_total_rejected
  result['created_admin_total_deleted'] = created_total_deleted - created_sub_admin_total_deleted

  result['user_total_pending'] = total_pending - created_total_pending
  result['user_total_approved'] = total_approved - created_total_approved
  result['user_total_disabled'] = total_disabled - created_total_disabled
  result['user_total_rejected'] = total_rejected - created_total_rejected
  result['user_total_deleted'] = total_deleted - created_total_deleted

  const [
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
  ] = await Promise.all([
    today_total_claim_pending_query,
    today_total_claim_approved_query,
    today_total_claim_disabled_query,
    yesterday_claim_total_pending_query,
    yesterday_claim_total_approved_query,
    yesterday_claim_total_disabled_query,
    week_total_claim_pending_query,
    week_total_claim_approved_query,
    week_total_claim_disabled_query,
    month_total_claim_pending_query,
    month_total_claim_approved_query,
    month_total_claim_disabled_query,
  ])

  result['today_total_claim_pending'] = today_total_claim_pending
  result['today_total_claim_approved'] = today_total_claim_approved
  result['today_total_claim_rejected'] = today_total_claim_disabled

  result['yesterday_claim_total_pending'] = yesterday_claim_total_pending
  result['yesterday_claim_total_approved'] = yesterday_claim_total_approved
  result['yesterday_claim_total_rejected'] = yesterday_claim_total_disabled

  result['week_total_claim_pending'] = week_total_claim_pending
  result['week_total_claim_approved'] = week_total_claim_approved
  result['week_total_claim_rejected'] = week_total_claim_disabled

  result['month_total_claim_pending'] = month_total_claim_pending
  result['month_total_claim_approved'] = month_total_claim_approved
  result['month_total_claim_rejected'] = month_total_claim_disabled

  result['total_bulk_upload_pending'] = total_bulk_upload_pending
  result['total_bulk_upload_approved'] = total_bulk_upload_approved
  result['total_bulk_upload_disabled'] = total_bulk_upload_disabled
  result['total_bulk_upload_rejected'] = total_bulk_upload_rejected

  result['manual_retrievals_pending'] = manual_retrievals_pending
  result['manual_retrievals_approved'] = manual_retrievals_approved
  result['manual_retrievals_rejected'] = manual_retrievals_rejected

  result['professional_manual_retrievals_pending'] = professional_manual_retrievals_pending
  result['professional_manual_retrievals_approved'] = professional_manual_retrievals_approved
  result['professional_manual_retrievals_rejected'] = professional_manual_retrievals_rejected

  result['events_manual_retrievals_pending'] = events_manual_retrievals_pending
  result['events_manual_retrievals_approved'] = events_manual_retrievals_approved
  result['events_manual_retrievals_rejected'] = events_manual_retrievals_rejected

  result['funding_manual_retrievals_pending'] = funding_manual_retrievals_pending
  result['funding_manual_retrievals_approved'] = funding_manual_retrievals_approved
  result['funding_manual_retrievals_rejected'] = funding_manual_retrievals_rejected

  const [verifiedInvestorCount, partnerStats, employeeRequestCounts] = await Promise.all([getVerifiedInvestorCount(), getPartnerDashboardStats(), getEmployeeRequestCounts()])

  result['total_number_investor'] = verifiedInvestorCount
  result['total_event_partners_sponsor'] = partnerStats.total_event_partners_sponsor
  result['become_partners_pending'] = partnerStats.become_partners_pending
  result['become_partners_approved'] = partnerStats.become_partners_approved
  result['become_partners_rejected'] = partnerStats.become_partners_rejected
  result['live_company_partners'] = partnerStats.live_company_partners

  result['user_as_employee_request_pending'] = employeeRequestCounts.pending
  result['user_as_employee_request_approved'] = employeeRequestCounts.approved
  result['user_as_employee_request_rejected'] = 0

  result['total_admin_created'] = await companyM.countDocuments(buildTotalAdminCreatedFilter())
  result['total_company'] = await companyM.countDocuments()
  result['disabled_company'] = await companyM.countDocuments(buildTotalDisabledFilter())
  result['rejected_company'] = await companyM.countDocuments(buildCompanyStatusBreakdownFilter({ approvalStatus: 2 }))

  result['pending_company'] = await companyM.countDocuments(buildCompanyStatusBreakdownFilter({ approvalStatus: 0 }))
  result['pending_company_users'] = await companyM.countDocuments(buildCompanyStatusBreakdownFilter({ approvalStatus: 0, createdByType: 'user' }))
  result['pending_company_admins'] = await companyM.countDocuments(buildCompanyStatusBreakdownFilter({ approvalStatus: 0, createdByType: 'admin' }))

  result['live_company'] = await companyM.countDocuments(buildCompanyStatusBreakdownFilter({ approvalStatus: 1 }))
  result['live_company_users'] = await companyM.countDocuments(buildCompanyStatusBreakdownFilter({ approvalStatus: 1, createdByType: 'user' }))
  result['live_company_admins'] = await companyM.countDocuments(buildCompanyStatusBreakdownFilter({ approvalStatus: 1, createdByType: 'admin' }))
  result['live_claimed_company'] = await companyM.countDocuments(buildCompanyStatusBreakdownFilter({ approvalStatus: 1, createdByType: 'admin', requireClaimedUser: true }))

  result['live_company_events'] = await countFirst(eventM.aggregate(buildLiveCompanyEventsCountPipeline()))
  result['company_event_ongoing'] = await countFirst(eventM.aggregate(buildEventOngoingCountPipeline({ presentDateTime: present_date_n_time })))
  result['company_event_upcoming'] = await countFirst(eventM.aggregate(buildEventUpcomingCountPipeline({ presentDateTime: present_date_n_time })))
  result['company_event_completed'] = await countFirst(eventM.aggregate(buildEventCompletedCountPipeline({ presentDateTime: present_date_n_time })))

  result['user_claim_pending'] = await countFirst(company_claim_requestsM.aggregate(buildUserClaimCountPipeline({ claimStatus: 1 })))
  result['user_claim_approved'] = await countFirst(company_claim_requestsM.aggregate(buildUserClaimCountPipeline({ claimStatus: 2 })))
  result['user_claim_rejected'] = await countFirst(company_claim_requestsM.aggregate(buildUserClaimCountPipeline({ claimStatus: 3 })))

  return result
}
