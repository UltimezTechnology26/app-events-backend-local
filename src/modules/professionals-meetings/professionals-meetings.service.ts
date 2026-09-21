// modules/professionals-meetings/professionals-meetings.service.ts
// Ports controllers/app/meetings/meeting.js in full (6 routes): /schedule_job_interview/:applicant_id,
// /schedule_1on1_meeting, /schedule_journalist_interview, /schedule_business_meeting,
// /list/:skip/:limit, /status/:meeting_id. Same behavior, same response shapes, same quirks.
// meetingM and job_applied_listM are shared with the still-legacy
// admin_panel/app/meetings/meetings.js (meetingM) and app/jobs/job_applicants.js
// (job_applied_listM) — required directly, not colocated.
import sanitize from 'mongo-sanitize'
import type {
  AllAuthResult, ScheduleJobInterviewBody, Schedule1on1Body, ScheduleJournalistInterviewBody,
  ScheduleBusinessMeetingBody, UpdateMeetingStatusBody,
} from './professionals-meetings.types'

const MeetingM = require('../../../models/app/meetings/meetingM')
const JobAppliedListM = require('../../../models/app/jobs/job_applied_listM')
const ProfessionalM = require('../../../models/app/professionalsM')
const CompanyM = require('../../../models/app/company/companyM')
const { uploadDocumentFunc } = require('../../../utils/helpers/helper')
const { sendJobScheduledEmail, sendJournalistInterviewEmail, sendMeetingRequestEmail, sendConfirmedMeetingEmail } = require('../../../utils/helpers/app_helper')
const { deleteKeysByPattern } = require('../../../config/cache_helper')
const { getMeetingList } = require('../../../services/main/meetings')

function resolveUserRowId(auth: AllAuthResult, fallbackRaw: unknown): number {
  if (!auth.status) return 0
  if (auth.message.user_type === 1) return Number.parseInt(String(auth.message.user_row_id))
  return Number.parseInt(String(fallbackRaw)) || 0
}

export async function scheduleJobInterview(auth: AllAuthResult, applicantIdRaw: string, body: ScheduleJobInterviewBody, queryUserRowIdRaw: unknown, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return { status: false, message: auth.message }

  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)
  const applicantId = Number.parseInt(applicantIdRaw) || null
  const applicationDetails = await JobAppliedListM.findOne({ _id: applicantId, status: 'approved' })
  const companyRowId = Number.parseInt(String(body.company_row_id)) || 0

  if (!applicationDetails) return { status: false, message: 'Failed to schedule meet' }
  if (!companyRowId) return { status: false, message: 'Failed to schedule meet' }

  let uploadDocument: string | null = null
  if (body.upload_document) {
    const uploadedDocument = await uploadDocumentFunc(body.upload_document, 3)
    if (uploadedDocument.status) {
      uploadDocument = uploadedDocument.path
    } else {
      return { status: false, message: 'Document upload failed' }
    }
  }

  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }

  const utcDate = new Date(`${body.meeting_datetime}${body.meeting_timezone}`)
  if (Number.isNaN(utcDate.getTime())) return { status: false, message: 'Invalid meeting datetime or timezone' }

  const meetingPayload = {
    meeting_type: 'job_interview',
    requested_user_row_id: [applicationDetails?.user_row_id],
    company_row_id: companyRowId,
    user_row_id: userRowId,
    rescheduled_by: companyRowId,
    job_title: sanitize(body.job_role),
    job_role: sanitize(body.job_role),
    upload_document: uploadDocument,
    meeting_title: body.job_role,
    meeting_datetime: utcDate,
    meeting_timezone: body.meeting_timezone,
    meeting_link: body.meeting_link,
    status: 'pending',
  }

  const newMeeting = new MeetingM(meetingPayload)
  await newMeeting.save()
  await JobAppliedListM.updateOne({ _id: applicantId }, { $set: { status: 'scheduled' } })
  await deleteKeysByPattern('interview_list_*')

  const [user, company] = await Promise.all([
    ProfessionalM.findOne({ _id: applicationDetails?.user_row_id }, { full_name: 1, email_id: 1 }),
    CompanyM.findOne({ _id: companyRowId }, { company_name: 1, company_email_id: 1 }),
  ])

  await sendJobScheduledEmail(
    { full_name: user?.full_name, email_id: user?.email_id },
    { resume: `https://image.coinpedia.org/${applicationDetails?.resume}`, meeting_datetime: utcDate, meeting_link: body.meeting_link, company_name: company?.company_name },
  )

  return { status: true, message: 'Job Interview Meeting created successfully!' }
}

export async function schedule1on1Meeting(auth: AllAuthResult, body: Schedule1on1Body, queryUserRowIdRaw: unknown, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return { status: false, message: auth.message }

  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)
  if (!userRowId) return { status: false, message: 'Failed to schedule meet' }

  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }

  const utcDate = new Date(`${body.meeting_datetime}${body.meeting_timezone}`)
  if (Number.isNaN(utcDate.getTime())) return { status: false, message: 'Invalid meeting datetime or timezone' }

  const meetingPayload = {
    meeting_type: '1on1',
    requested_user_row_id: [Number.parseInt(String(body.professional_id))],
    user_row_id: userRowId,
    rescheduled_by: userRowId,
    meeting_title: body.meeting_title,
    meeting_datetime: utcDate,
    meeting_timezone: body.meeting_timezone,
    meeting_link: body.meeting_link,
    status: 'pending',
  }

  const newMeeting = new MeetingM(meetingPayload)
  await newMeeting.save()
  await deleteKeysByPattern('interview_list_*')

  const [user, requestedUser] = await Promise.all([
    ProfessionalM.findOne({ _id: body.professional_id }, { full_name: 1, email_id: 1 }),
    ProfessionalM.findOne({ _id: userRowId }, { full_name: 1, email_id: 1 }),
  ])

  await sendMeetingRequestEmail(
    { full_name: user?.full_name, email_id: user?.email_id },
    { meeting_title: body.meeting_title, meeting_datetime: utcDate },
    '1:1',
    requestedUser?.full_name,
  )

  return { status: true, message: 'Job Interview Meeting created successfully!' }
}

export async function scheduleJournalistInterview(auth: AllAuthResult, body: ScheduleJournalistInterviewBody, queryUserRowIdRaw: unknown, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return { status: false, message: auth.message }

  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)
  if (!userRowId) return { status: false, message: 'Failed to schedule meet', here: 'true' }

  // Flagged, not fixed: the threshold actually enforced is 5 followers, but the error message
  // claims "at least 2000 followers" — a pre-existing mismatch between the check and its copy.
  const followerCheck = await ProfessionalM.aggregate([
    { $match: { _id: userRowId } },
    {
      $lookup: {
        from: 'cln_professionals_followers',
        localField: '_id',
        foreignField: 'following_user_row_id',
        as: 'followers_info',
        pipeline: [
          {
            $lookup: {
              from: 'cln_professionals',
              localField: 'follower_user_row_id',
              foreignField: '_id',
              as: 'user_info',
              pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }],
            },
          },
          { $unwind: { path: '$user_info' } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
      },
    },
    { $set: { total_followers: { $ifNull: [{ $arrayElemAt: ['$followers_info.count', 0] }, 0] } } },
  ])

  const totalFollowers = followerCheck?.[0]?.total_followers || 0
  if (totalFollowers < 5) {
    return { status: false, message: 'You must have at least 2000 followers to schedule a journalist interview.', followers: totalFollowers }
  }

  let uploadDocument: string | null = null
  if (body.upload_document) {
    const uploadedDocument = await uploadDocumentFunc(body.upload_document, 3)
    if (uploadedDocument.status) {
      uploadDocument = uploadedDocument.path
    } else {
      return { status: false, message: 'Document upload failed' }
    }
  }

  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }

  const utcDate = new Date(`${body.meeting_datetime}${body.meeting_timezone}`)
  if (Number.isNaN(utcDate.getTime())) return { status: false, message: 'Invalid meeting datetime or timezone' }

  const meetingPayload = {
    meeting_type: 'journalist_interview',
    user_row_id: userRowId,
    upload_document: uploadDocument,
    rescheduled_by: userRowId,
    meeting_title: body.meeting_title,
    meeting_datetime: utcDate,
    meeting_timezone: body.meeting_timezone,
    meeting_link: body.meeting_link,
    status: 'pending',
  }

  const newMeeting = new MeetingM(meetingPayload)
  await newMeeting.save()
  await deleteKeysByPattern('interview_list_*')

  const user = await ProfessionalM.findOne({ _id: userRowId }, { full_name: 1, email_id: 1 })
  await sendJournalistInterviewEmail(
    { full_name: user?.full_name, email_id: user?.email_id },
    { meeting_title: body.meeting_title, upload_document: uploadDocument, meeting_datetime: utcDate },
  )

  return { status: true, message: 'Job Interview Meeting created successfully!' }
}

export async function scheduleBusinessMeeting(auth: AllAuthResult, body: ScheduleBusinessMeetingBody, queryUserRowIdRaw: unknown, preValidationErrors: Record<string, unknown>) {
  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }
  if (!auth.status) return { status: false, message: auth.message }

  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)
  const professionalIds = (body.professional_ids || []).map((id) => Number.parseInt(String(id)))
  const companyIds = (body.company_ids || []).map((id) => Number.parseInt(String(id)))

  if (professionalIds.length === 0 && companyIds.length === 0) {
    return { status: false, message: 'At least one of professional or company must be provided.' }
  }
  if (!userRowId) return { status: false, message: 'Failed to schedule meet' }

  const companyRowId = Number.parseInt(String(body.company_row_id)) || 0

  const utcDate = new Date(`${body.meeting_datetime}${body.meeting_timezone}`)
  if (Number.isNaN(utcDate.getTime())) return { status: false, message: 'Invalid meeting datetime or timezone' }

  let meetingPayload: Record<string, unknown> = {
    meeting_type: 'business_meeting',
    requested_company_row_id: companyIds,
    requested_user_row_id: professionalIds,
    meeting_title: body.meeting_title,
    meeting_datetime: utcDate,
    meeting_timezone: body.meeting_timezone,
    meeting_link: body.meeting_link,
    status: 'scheduled',
  }
  meetingPayload = companyRowId ? { ...meetingPayload, company_row_id: companyRowId } : { ...meetingPayload, user_row_id: userRowId }

  const newMeeting = new MeetingM(meetingPayload)
  await newMeeting.save()
  await deleteKeysByPattern('interview_list_*')

  let requestedUser: string | undefined
  if (companyRowId) {
    const company = await CompanyM.findOne({ _id: companyRowId }, { company_name: 1, company_email_id: 1 })
    requestedUser = company?.company_name
  } else {
    const user = await ProfessionalM.findOne({ _id: userRowId }, { full_name: 1, email_id: 1 })
    requestedUser = user?.full_name
  }

  for (const item of companyIds) {
    const company = await CompanyM.findOne({ _id: item }, { company_name: 1, company_email_id: 1 })
    await sendConfirmedMeetingEmail(
      { full_name: company?.company_name, email_id: company?.company_email_id },
      { meeting_title: body.meeting_title, meeting_datetime: utcDate, meeting_link: body.meeting_link },
      'Business',
      requestedUser,
    )
  }

  for (const item of professionalIds) {
    const professional = await ProfessionalM.findOne({ _id: item }, { full_name: 1, email_id: 1 })
    await sendConfirmedMeetingEmail(
      { full_name: professional?.full_name, email_id: professional?.email_id },
      { meeting_title: body.meeting_title, meeting_datetime: utcDate, meeting_link: body.meeting_link },
      'Business',
      requestedUser,
    )
  }

  return { status: true, message: 'Business Meeting created successfully!' }
}

export async function getMeetingsListResponse(auth: AllAuthResult, req: any, queryUserRowIdRaw: unknown, companyRowIdRaw: unknown) {
  if (!auth.status) return { status: false, message: auth.message }

  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)
  const companyRowId = Number.parseInt(String(companyRowIdRaw)) || 0

  return getMeetingList(req, companyRowId, String(userRowId))
}

export async function updateMeetingStatus(auth: AllAuthResult, meetingIdRaw: string, body: UpdateMeetingStatusBody, preValidationErrors: Record<string, unknown>) {
  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }
  if (!auth.status) return { status: false, message: auth.message }

  const userRowId = Number.parseInt(String(auth.message.user_row_id))
  const meetingId = Number.parseInt(meetingIdRaw) || null
  if (!meetingId) return { status: false, message: 'Meeting ID is required.' }

  const meetingDoc = await MeetingM.findOne({ _id: meetingId, meeting_type: { $in: ['journalist_interview', '1on1', 'job_interview'] } })
  if (!meetingDoc) return { status: false, message: 'Meeting not found.' }

  if (body.status === 'rescheduled' && !['1on1', 'journalist_interview'].includes(meetingDoc.meeting_type)) {
    return { status: false, message: 'This meeting type cannot be rescheduled.' }
  }

  if (
    meetingDoc.requested_user_row_id?.[0]?.toString() !== userRowId.toString()
    && meetingDoc.user_row_id?.toString() !== userRowId.toString()
    && meetingDoc.rescheduled_by?.toString() !== userRowId.toString()
  ) {
    return { status: false, message: 'Unauthorized to update this meeting.' }
  }

  if (meetingDoc.rescheduled_by?.toString() === userRowId.toString()) {
    return { status: false, message: 'Unauthorized to update this meeting.' }
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
    status_update_by: userRowId,
    status_update_date: new Date().toISOString(),
  }

  if (body.status === 'rejected') updateFields['rejected_comment'] = body.rejected_comment
  if (body.status === 'rescheduled') {
    updateFields['meeting_timezone'] = body.meeting_timezone
    updateFields['meeting_datetime'] = new Date(body.meeting_datetime as string)
    updateFields['rescheduled_count'] = (Number.parseInt(meetingDoc.rescheduled_count || '0') + 1).toString()
    updateFields['rescheduled_by'] = userRowId
    updateFields['status'] = 'pending'
  }

  await MeetingM.updateOne({ _id: meetingId }, { $set: updateFields })
  await deleteKeysByPattern('interview_list_*')

  if (body.status === 'scheduled') {
    let userData: { full_name?: string; email_id?: string }
    if (meetingDoc?.company_row_id) {
      const company = await CompanyM.findOne({ _id: meetingDoc?.company_row_id }, { company_name: 1, company_email_id: 1 })
      userData = { full_name: company?.company_name, email_id: company?.company_email_id }
    } else {
      const user = await ProfessionalM.findOne({ _id: meetingDoc?.user_row_id }, { full_name: 1, email_id: 1 })
      userData = { full_name: user?.full_name, email_id: user?.email_id }
    }
    const requestedUser = await ProfessionalM.findOne({ _id: meetingDoc?.requested_user_row_id[0] }, { full_name: 1, email_id: 1 })

    let meetingTypeLabel: string
    if (meetingDoc.meeting_type === 'journalist_interview') meetingTypeLabel = 'Journalist Interview'
    else if (meetingDoc.meeting_type === '1on1') meetingTypeLabel = '1:1'
    else if (meetingDoc.meeting_type === 'job_interview') meetingTypeLabel = 'Job Interview'
    else meetingTypeLabel = ''

    await sendConfirmedMeetingEmail(
      userData,
      { meeting_title: meetingDoc.meeting_title, meeting_datetime: meetingDoc?.meeting_datetime, meeting_link: meetingDoc.meeting_link },
      meetingTypeLabel,
      meetingDoc.meeting_type === 'journalist_interview' ? 'Coinpedia Team' : requestedUser?.full_name,
    )
  }

  return { status: true, message: 'Meeting status updated successfully!' }
}
