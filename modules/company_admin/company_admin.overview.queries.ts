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
