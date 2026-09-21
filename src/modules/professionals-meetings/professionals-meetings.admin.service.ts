// modules/professionals-meetings/professionals-meetings.admin.service.ts
// Ports admin_panel/app/meetings/meetings.js in full (4 routes): /journalist_interview/:skip/:limit,
// /journalist_overview, /list/:skip/:limit, /status/:meeting_id.
import { buildJournalistInterviewListPipeline, buildJournalistInterviewCountPipeline, buildAdminMeetingsListPipeline } from './professionals-meetings.admin.queries'
import type { AdminAuthResult, JournalistInterviewListQuery, AdminMeetingsListQuery, AdminUpdateMeetingStatusBody } from './professionals-meetings.admin.types'

const MeetingM = require('../../../models/app/meetings/meetingM')
const { deleteKeysByPattern } = require('../../../config/cache_helper')

export async function getJournalistInterviewList(auth: AdminAuthResult, skipRaw: string, limitRaw: string, query: JournalistInterviewListQuery) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  if (!auth.status) return { status: false, message: auth.message }

  const { search, status, start_date: startDate, end_date: endDate } = query

  const filter: Record<string, any> = { meeting_type: 'journalist_interview' }
  if (status && ['scheduled', 'pending', 'rejected'].includes(status)) filter.status = status
  if (startDate || endDate) {
    filter.meeting_datetime = {}
    if (startDate) filter.meeting_datetime.$gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      filter.meeting_datetime.$lte = end
    }
  }

  const [meetingDetails, countResult] = await Promise.all([
    MeetingM.aggregate(buildJournalistInterviewListPipeline(filter, search, skip, limit)),
    MeetingM.aggregate(buildJournalistInterviewCountPipeline(filter, search)),
  ])

  const totalCount = countResult.length > 0 ? countResult[0].total : 0

  return { status: true, data: meetingDetails, count: totalCount }
}

export async function getJournalistOverview(auth: AdminAuthResult) {
  if (!auth.status) return auth

  const baseFilter = { meeting_type: 'journalist_interview' }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(todayStart.getDate() - 1)
  const yesterdayEnd = new Date(todayEnd)
  yesterdayEnd.setDate(todayEnd.getDate() - 1)

  const lastWeekStart = new Date(todayStart)
  lastWeekStart.setDate(todayStart.getDate() - 7)

  const lastMonthStart = new Date(todayStart)
  lastMonthStart.setDate(todayStart.getDate() - 30)

  const [result] = await MeetingM.aggregate([
    { $match: baseFilter },
    {
      $facet: {
        today: [{ $match: { meeting_datetime: { $gte: todayStart, $lte: todayEnd } } }, { $count: 'count' }],
        yesterday: [{ $match: { meeting_datetime: { $gte: yesterdayStart, $lte: yesterdayEnd } } }, { $count: 'count' }],
        last_week: [{ $match: { meeting_datetime: { $gte: lastWeekStart, $lt: todayStart } } }, { $count: 'count' }],
        last_month: [{ $match: { meeting_datetime: { $gte: lastMonthStart, $lt: todayStart } } }, { $count: 'count' }],
      },
    },
    {
      $project: {
        today: { $ifNull: [{ $arrayElemAt: ['$today.count', 0] }, 0] },
        yesterday: { $ifNull: [{ $arrayElemAt: ['$yesterday.count', 0] }, 0] },
        last_week: { $ifNull: [{ $arrayElemAt: ['$last_week.count', 0] }, 0] },
        last_month: { $ifNull: [{ $arrayElemAt: ['$last_month.count', 0] }, 0] },
      },
    },
  ])

  return { status: true, data: result || {} }
}

export async function getAdminMeetingsList(auth: AdminAuthResult, skipRaw: string, limitRaw: string, query: AdminMeetingsListQuery) {
  if (!auth.status) return { status: false, message: auth.message }

  const { search, start_date: startDate, end_date: endDate } = query
  const meetingType = query.meeting_type ? query.meeting_type.toLowerCase() : null

  const statusFilter: Record<string, any> = {}
  if (search) {
    statusFilter.$or = [
      { meeting_title: { $regex: search, $options: 'i' } },
      { job_role: { $regex: search, $options: 'i' } },
      { 'user_info.full_name': { $regex: search, $options: 'i' } },
    ]
  }
  if (startDate || endDate) {
    statusFilter.meeting_datetime = {}
    if (startDate) statusFilter.meeting_datetime.$gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      statusFilter.meeting_datetime.$lte = end
    }
  }
  statusFilter.meeting_type = meetingType || { $in: ['1on1', 'business_meeting', 'job_interview'] }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  const [meetingDetails, countQueryAgg] = await Promise.all([
    MeetingM.aggregate(buildAdminMeetingsListPipeline(statusFilter, skip, limit)),
    MeetingM.aggregate([{ $match: statusFilter }, { $count: 'total' }]),
  ])

  const countQuery = countQueryAgg.length ? countQueryAgg[0].total : 0

  if (!meetingDetails.length) {
    return { status: false, data: [], message: 'No interview meetings found.' }
  }

  return { status: true, message: 'Job interview details fetched successfully!', data: meetingDetails, count: countQuery }
}

export async function updateAdminMeetingStatus(auth: AdminAuthResult, meetingIdRaw: string, body: AdminUpdateMeetingStatusBody, preValidationErrors: Record<string, unknown>) {
  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }
  if (!auth.status) return { status: false, message: auth.message }

  const adminManagerType = Number.parseInt(String(auth.message.admin_manager_type))
  let adminRowId = 0
  if (adminManagerType === 2) adminRowId = Number(auth.message.admin_row_id)

  const meetingId = Number.parseInt(meetingIdRaw) || null
  if (!meetingId) return { status: false, message: 'Meeting ID is required.' }

  const meetingDoc = await MeetingM.findOne({ _id: meetingId })
  if (!meetingDoc) return { status: false, message: 'Meeting not found.' }

  if (!['journalist_interview'].includes(meetingDoc.meeting_type)) {
    return { status: false, message: 'This meeting type cannot be rescheduled.' }
  }

  if (body.status === 'rejected' && !body.rejected_comment?.trim()) {
    return { status: false, message: 'Rejected comment is required when rejecting a meeting.' }
  }

  if (body.status === 'rescheduled') {
    if (!body.meeting_timezone || !body.meeting_datetime) {
      return { status: false, message: 'Meeting timezone and datetime are required when rescheduling.' }
    }
    const currentRescheduledCount = Number.parseInt(meetingDoc.rescheduled_count || '0')
    if (currentRescheduledCount >= 3) {
      return { status: false, message: 'Reschedule meeting limit exceeded.' }
    }
  }

  const updateFields: Record<string, unknown> = {
    status: body.status,
    status_update_admin_user_type: adminManagerType,
    status_update_by: adminRowId,
    status_update_date: new Date().toISOString(),
  }

  if (body.status === 'scheduled') updateFields['meeting_link'] = body.meeting_link
  if (body.status === 'rejected') updateFields['rejected_comment'] = body.rejected_comment
  if (body.status === 'rescheduled') {
    updateFields['meeting_timezone'] = body.meeting_timezone
    updateFields['meeting_datetime'] = new Date(body.meeting_datetime as string)
    updateFields['rescheduled_count'] = (Number.parseInt(meetingDoc.rescheduled_count || '0') + 1).toString()
    updateFields['rescheduled_by'] = 0
    updateFields['status'] = 'pending'
  }

  await MeetingM.updateOne({ _id: meetingId }, { $set: updateFields })
  await deleteKeysByPattern('interview_list_*')

  return { status: true, message: 'Meeting status updated successfully!' }
}
