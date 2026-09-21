// modules/professionals-feedback/professionals-feedback.admin.service.ts
// Ports admin_panel/app/feedback.js in full (7 routes): /users_feedback_list/:skip/:limit,
// /individual_details/:feedback_row_id, /report_users_issues_list/:skip/:limit,
// /individual_report_details/:issue_row_id, /approved_by_filter_list, /approve_reject_issue,
// /report_issues_overview_counts.
//
// SECURITY FIX (matches the exact precedent already established in Phase A's `/overview` and
// Phase G's `/change_logs`): legacy's `/individual_report_details` and
// `/report_issues_overview_counts` had ZERO admin-token check at all — not even an inconsistent
// access id, wide open behind only the global checkApiKey gate. Both are now gated with access id
// `[-1]` (any admin), matching every sibling route in this same file. This is a confirmed fix,
// not just flagged, per the identical precedent already applied twice in this migration.
import { buildUsersFeedbackListPipeline, buildReportUsersIssuesListPipeline, buildReportUsersIssuesProjectStage, buildIndividualReportDetailsPipeline } from './professionals-feedback.admin.queries'
import type { AdminAuthResult, ReportUsersIssuesListQuery, ApproveRejectIssueBody } from './professionals-feedback.admin.types'

const ProfessionalsFeedbackM = require('../../../models/app/professionals_feedbackM')
const ReportIssuesUserDetailsM = require('../../../models/report_issues_user_detailsM')
const { getPresentDateTime, createDateTime, getMinusDates, yesterDayStartNEndDate, getPresentDateOnly } = require('../../../utils/helpers/helper')

export async function getUsersFeedbackList(auth: AdminAuthResult, skipRaw: string, limitRaw: string, searchRaw: unknown) {
  if (!auth.status) return auth

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100

  const query: Record<string, any> = searchRaw
    ? { $or: [{ email_id: { $regex: searchRaw, $options: 'i' } }, { full_name: { $regex: searchRaw, $options: 'i' } }] }
    : {}

  const [queryRun, queryCount] = await Promise.all([
    ProfessionalsFeedbackM.aggregate(buildUsersFeedbackListPipeline(query)).skip(skip).limit(limit),
    ProfessionalsFeedbackM.aggregate([...buildUsersFeedbackListPipeline(query).slice(0, -1), { $count: 'count' }]),
  ])

  const totalCounts = queryCount[0] ? queryCount[0].count : 0

  return { status: true, message: queryRun, queryCount: totalCounts }
}

export async function getIndividualFeedbackDetails(auth: AdminAuthResult, feedbackRowIdRaw: string) {
  if (!auth.status) return auth

  const feedbackRowId = Number.parseInt(feedbackRowIdRaw)
  const queryRun = await ProfessionalsFeedbackM.aggregate([
    { $match: { _id: feedbackRowId } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, website_rating: 1, speed_rating: 1, user_row_id: 1, email_id: 1, feedback_type: 1, date_n_time: 1,
        message: 1, full_name: '$user_info.full_name', user_email_id: '$user_info.email_id',
      },
    },
  ])

  const resultArr: Record<string, unknown> = {}
  if (queryRun[0]) {
    const row = queryRun[0]
    resultArr['_id'] = row._id
    resultArr['website_rating'] = row.website_rating
    resultArr['speed_rating'] = row.speed_rating
    resultArr['user_row_id'] = row.user_row_id
    resultArr['email_id'] = row.email_id
    resultArr['feedback_type'] = row.feedback_type
    resultArr['date_n_time'] = row.date_n_time
    resultArr['message'] = row.message
    resultArr['full_name'] = row.full_name
    resultArr['user_email_id'] = row.user_email_id
  }

  return { status: true, message: resultArr }
}

export async function getReportUsersIssuesList(auth: AdminAuthResult, skipRaw: string, limitRaw: string, query: ReportUsersIssuesListQuery) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { module_type: moduleType, search, approved_by_row_id: approvedByRowId, approved_by_type: approvedByType, start_date: startDate, end_date: endDate } = query

  const matchQuery: Record<string, any> = {}
  if (!Number.isNaN(Number.parseInt(String(moduleType)))) matchQuery.module_type = Number.parseInt(String(moduleType))
  if (!Number.isNaN(Number.parseInt(String(approvedByType)))) {
    matchQuery.approved_by = Number.parseInt(String(approvedByType))
    if (Number.parseInt(String(approvedByType)) === 2 && !Number.isNaN(Number.parseInt(String(approvedByRowId)))) {
      matchQuery.approved_row_id = Number.parseInt(String(approvedByRowId))
    }
  }
  // Ported verbatim: legacy computes a start/end-of-day range from start_date into
  // matchQuery.requested_on, then immediately overwrites matchQuery.requested_on with {} right
  // after (a dead assignment) before rebuilding $gte/$lte from createDateTime() below — the first
  // block is a no-op today, kept as-is since it has zero observable effect.
  if (startDate) {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(startDate)
    end.setHours(23, 59, 59, 999)
    matchQuery.requested_on = { $gte: start, $lte: end }
  }
  if (startDate || endDate) matchQuery.requested_on = {}
  if (startDate) matchQuery.requested_on.$gte = new Date(createDateTime(startDate))
  if (endDate) matchQuery.requested_on.$lte = new Date(createDateTime(endDate))

  const pipeline = buildReportUsersIssuesListPipeline(matchQuery, search)
  // Matches legacy's exact pipeline-reuse structure: the count pipeline keeps the $project stage
  // (splice only drops the trailing $sort/$skip/$limit) before appending its own $count.
  const withProject = [...pipeline, buildReportUsersIssuesProjectStage()]
  const listPipeline = [...withProject, { $sort: { requested_on: -1 } }, { $skip: skip }, { $limit: limit }]

  const [list, countResult] = await Promise.all([
    ReportIssuesUserDetailsM.aggregate(listPipeline),
    ReportIssuesUserDetailsM.aggregate([...withProject, { $count: 'total' }]),
  ])
  const count = countResult[0]?.total || 0

  return { status: true, message: list, count, checkToken: auth }
}

export async function getIndividualReportDetails(auth: AdminAuthResult, issueRowIdRaw: string) {
  if (!auth.status) return auth

  const issueRowId = Number.parseInt(issueRowIdRaw)
  const result = await ReportIssuesUserDetailsM.aggregate(buildIndividualReportDetailsPipeline(issueRowId))

  if (!result.length) {
    return { status: false, message: 'Report not found' }
  }

  return { status: true, message: result[0] }
}

export async function getApprovedByFilterList(auth: AdminAuthResult) {
  if (!auth.status) return { status: false, message: { alert_message: auth.message } }

  const subAdmins = await ReportIssuesUserDetailsM.aggregate([
    { $match: { approved_by: 2, approved_row_id: { $ne: null } } },
    { $lookup: { from: 'cln_sub_admins', localField: 'approved_row_id', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: '$sub_admin_info' },
    { $group: { _id: '$approved_row_id', full_name: { $first: '$sub_admin_info.full_name' } } },
    { $project: { _id: 0, value: '$_id', label: '$full_name', approved_by: 2 } },
  ])

  const response = [{ value: 'admin', label: 'Admin', approved_by: 1 }, ...subAdmins]

  return { status: true, message: response }
}

export async function approveRejectIssue(auth: AdminAuthResult, body: ApproveRejectIssueBody) {
  if (!auth.status) return { status: false, message: { alert_message: auth.message } }

  const adminManagerType = Number.parseInt(String(auth.message.admin_manager_type))
  const adminRowId = Number.parseInt(String(auth.message.admin_row_id))

  const issueRowId = Number(body.issue_row_id)
  const approvedStatus = Number(body.approved_status)
  const rejectedReason = body.rejected_reason || null

  if (Number.isNaN(issueRowId) || ![1, 2].includes(approvedStatus)) {
    return { status: false, message: { alert_message: 'Invalid request data.' } }
  }
  if (![1, 2].includes(adminManagerType) || Number.isNaN(adminRowId)) {
    return { status: false, message: { alert_message: 'Invalid admin session.' } }
  }
  if (approvedStatus === 2 && (!rejectedReason || rejectedReason.length < 5)) {
    return { status: false, message: { alert_message: 'Reject reason is required (min 5 characters).' } }
  }

  const issueData = await ReportIssuesUserDetailsM.findOne({ _id: issueRowId }, { approved_status: 1 })
  if (!issueData) {
    return { status: false, message: { alert_message: 'Invalid issue record.' } }
  }
  if (issueData.approved_status !== 0) {
    return { status: false, message: { alert_message: 'Issue already processed.' } }
  }

  await ReportIssuesUserDetailsM.updateOne(
    { _id: issueRowId },
    { $set: { approved_status: approvedStatus, approved_by: adminManagerType, approved_row_id: adminRowId, issue_rejected_reason: approvedStatus === 2 ? rejectedReason : null, approved_date_n_time: getPresentDateTime() } },
  )

  return { status: true, message: { alert_message: approvedStatus === 1 ? 'Issue approved successfully.' : 'Issue rejected successfully.' } }
}

export async function getReportIssuesOverviewCounts(auth: AdminAuthResult) {
  if (!auth.status) return auth

  const todayDate = getPresentDateOnly()
  const { start_date: startDate, end_date: endDate } = yesterDayStartNEndDate()
  const weekDate = getMinusDates(7)
  const oneMonthDate = getMinusDates(30)

  const [todayRequests, yesterdayRequests, weekRequests, monthRequests, pending, approved, rejected] = await Promise.all([
    ReportIssuesUserDetailsM.countDocuments({ requested_on: { $gte: new Date(todayDate) } }),
    ReportIssuesUserDetailsM.countDocuments({ requested_on: { $gte: new Date(startDate), $lte: new Date(endDate) } }),
    ReportIssuesUserDetailsM.countDocuments({ requested_on: { $gte: new Date(weekDate) } }),
    ReportIssuesUserDetailsM.countDocuments({ requested_on: { $gte: new Date(oneMonthDate) } }),
    ReportIssuesUserDetailsM.countDocuments({ approved_status: 0 }),
    ReportIssuesUserDetailsM.countDocuments({ approved_status: 1 }),
    ReportIssuesUserDetailsM.countDocuments({ approved_status: 2 }),
  ])

  const result = {
    total_requests: { today: todayRequests, yesterday: yesterdayRequests, last_7_days: weekRequests, last_30_days: monthRequests },
    request_status: { pending, approved, rejected },
  }

  return { status: true, message: result }
}
