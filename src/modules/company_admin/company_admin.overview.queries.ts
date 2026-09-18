// modules/company_admin/company_admin.overview.queries.ts
//
// Ports the aggregation pipelines that stay in company_admin's own domain after merging
// company_overview + overview (Part 3 §7 Phase H step 3) — everything else (partner counts,
// funding/investor counts, employee/work-experience counts) is delegated to
// modules/partners/, modules/funding/, and modules/work-experience/ respectively.

/** Ports the live_company_events stat (eventM.aggregate, "company_event_query" in the real source). */
export function buildLiveCompanyEventsCountPipeline() {
  return [
    { $sort: { _id: -1 } },
    { $match: { active_status: 1, approval_status: 1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [{ $match: { approval_status: 1, active_status: 1 } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: { path: '$company_info' } },
    { $count: 'count' },
  ]
}

/** Ports the company_event_ongoing stat — events whose window contains the current moment. */
export function buildEventOngoingCountPipeline({ presentDateTime }: { presentDateTime: Date }) {
  return [
    { $sort: { _id: -1 } },
    { $match: { active_status: 1, approval_status: 1, start_date: { $lte: presentDateTime }, end_date: { $gte: presentDateTime } } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [{ $match: { approval_status: 1, active_status: 1 } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: { path: '$company_info' } },
    { $count: 'count' },
  ]
}

/** Ports the company_event_upcoming stat — events that haven't started yet. */
export function buildEventUpcomingCountPipeline({ presentDateTime }: { presentDateTime: Date }) {
  return [
    { $sort: { _id: -1 } },
    { $match: { active_status: 1, approval_status: 1, start_date: { $gte: presentDateTime } } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [{ $match: { approval_status: 1, active_status: 1 } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: { path: '$company_info' } },
    { $count: 'count' },
  ]
}

/** Ports the company_event_completed stat — events that have already ended. */
export function buildEventCompletedCountPipeline({ presentDateTime }: { presentDateTime: Date }) {
  return [
    { $sort: { _id: -1 } },
    { $match: { active_status: 1, approval_status: 1, end_date: { $lt: presentDateTime } } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [{ $match: { approval_status: 1, active_status: 1 } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: { path: '$company_info' } },
    { $count: 'count' },
  ]
}

/**
 * Ports the user_claim_pending/approved/rejected stats (company_claim_requestsM.aggregate) —
 * parameterized by claim_status (1=pending, 2=approved, 3=rejected), same 3 real-source pipelines
 * differing only in their final $match value, confirmed byte-identical otherwise before porting.
 */
export function buildUserClaimCountPipeline({ claimStatus }: { claimStatus: number }) {
  return [
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1, user_name: 1, full_name: 1, email_id: 1 } }],
      },
    },
    { $unwind: { path: '$user_info' } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_row_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [{ $match: { active_status: 1 } }, { $project: { _id: 1, company_name: 1, company_id: 1, company_email_id: 1, website_link: 1 } }],
      },
    },
    { $unwind: { path: '$company_info' } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_email_id: '$company_info.company_email_id',
        website_link: '$company_info.website_link',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
      },
    },
    { $match: { claim_status: claimStatus } },
    { $count: 'count' },
  ]
}

// --- countDocuments() filter builders (companyM/company_deleted_historyM/company_manual_retrievalsM/
// company_claim_requestsM) for getCompanyOverview's ~50 stat counters — grouped by stat family,
// each literal filter object copied verbatim from the original inline countDocuments() calls
// (including their real, sometimes-inconsistent field combinations, e.g. the *_disabled variants
// below do not all share the same shape) so behavior is unchanged.

/** total_pending/approved/disabled/rejected (companyM, no extra scoping). */
export function buildTotalPendingFilter() {
  return { active_status: 1, approval_status: 0 }
}
export function buildTotalApprovedFilter() {
  return { active_status: 1, approval_status: 1 }
}
export function buildTotalDisabledFilter() {
  return { active_status: 0 }
}
export function buildTotalRejectedFilter() {
  return { active_status: 1, approval_status: 2 }
}

/** total_bulk_upload_pending/approved/disabled/rejected (companyM, bulk_upload_status: 1). */
export function buildBulkUploadPendingFilter() {
  return { active_status: 1, approval_status: 0, bulk_upload_status: 1 }
}
export function buildBulkUploadApprovedFilter() {
  return { active_status: 1, approval_status: 1, bulk_upload_status: 1 }
}
export function buildBulkUploadDisabledFilter() {
  return { active_status: 0, bulk_upload_status: 1 }
}
export function buildBulkUploadRejectedFilter() {
  return { active_status: 1, approval_status: 2, bulk_upload_status: 1 }
}

/** created_sub_admin_total_pending/approved/disabled/rejected/deleted (companyM/company_deleted_historyM). */
export function buildSubAdminCreatedPendingFilter() {
  return { sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 0 }
}
export function buildSubAdminCreatedApprovedFilter() {
  return { sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 1 }
}
export function buildSubAdminCreatedDisabledFilter() {
  return { sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 0, approval_status: 1 }
}
export function buildSubAdminCreatedRejectedFilter() {
  return { sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 }, active_status: 1, approval_status: 2 }
}
export function buildSubAdminCreatedDeletedFilter() {
  return { sub_admin_row_id: { $gte: 1 }, claim_status: { $gte: 1 } }
}

/** created_total_pending/approved/disabled/rejected/deleted (companyM/company_deleted_historyM). */
export function buildAdminCreatedPendingFilter() {
  return { claim_status: { $gte: 1 }, active_status: 1, approval_status: 0 }
}
export function buildAdminCreatedApprovedFilter() {
  return { claim_status: { $gte: 1 }, active_status: 1, approval_status: 1 }
}
export function buildAdminCreatedDisabledFilter() {
  return { claim_status: { $gte: 1 }, active_status: 0, approval_status: 1 }
}
export function buildAdminCreatedRejectedFilter() {
  return { claim_status: { $gte: 1 }, active_status: 1, approval_status: 2 }
}
export function buildAdminCreatedDeletedFilter() {
  return { claim_status: { $gte: 1 } }
}

/**
 * manual_retrievals_*, professional_manual_retrievals_*, events_manual_retrievals_*, and
 * funding_manual_retrievals_* (company_manual_retrievalsM) — all 12 stats are the same
 * approval_status filter, optionally scoped to a created_from_type (1=professional,
 * 2=events, 3=funding).
 */
export function buildManualRetrievalsCountFilter({ approvalStatus, createdFromType }: { approvalStatus: number; createdFromType?: number }) {
  const filter: Record<string, number> = { approval_status: approvalStatus }
  if (createdFromType !== undefined) {
    filter.created_from_type = createdFromType
  }
  return filter
}

/**
 * today/yesterday/week/month_total_claim_pending/approved/disabled (company_claim_requestsM) —
 * all 12 stats are a claim_status filter plus a date_n_time lower bound, with an upper bound
 * added only for the "yesterday" window.
 */
export function buildClaimStatsCountFilter({ claimStatus, gte, lte }: { claimStatus: number; gte: Date; lte?: Date }) {
  const date_n_time: Record<string, Date> = { $gte: gte }
  if (lte) {
    date_n_time.$lte = lte
  }
  return { claim_status: claimStatus, date_n_time }
}

/** total_admin_created (companyM). */
export function buildTotalAdminCreatedFilter() {
  return { claim_status: 1 }
}

/**
 * pending_company(_users/_admins)/live_company(_users/_admins)/live_claimed_company/rejected_company
 * (companyM) — one approval_status + active_status filter, optionally narrowed to companies
 * created by a user (created_by_type: 0) or an admin (created_by_type: { $gte: 1 }), and
 * optionally further narrowed to admin-created companies a user has since claimed
 * (user_row_id: { $gte: 1 }, live_claimed_company only).
 */
export function buildCompanyStatusBreakdownFilter({
  approvalStatus,
  createdByType,
  requireClaimedUser,
}: {
  approvalStatus: number
  createdByType?: 'user' | 'admin'
  requireClaimedUser?: boolean
}) {
  const filter: Record<string, unknown> = { approval_status: approvalStatus, active_status: 1 }
  if (createdByType === 'user') {
    filter.created_by_type = 0
  } else if (createdByType === 'admin') {
    filter.created_by_type = { $gte: 1 }
  }
  if (requireClaimedUser) {
    filter.user_row_id = { $gte: 1 }
  }
  return filter
}
