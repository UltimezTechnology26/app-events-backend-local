// modules/professionals-job-applicants/professionals-job-applicants.service.ts
// Ports controllers/app/jobs/job_applicants.js in full (4 routes): /add_n_update_details,
// /user_applied_list/:skip/:limit, /list/:skip/:limit, /status/:application_id.
// job_applied_listM is also required by the still-legacy controllers/app/meetings/meeting.js —
// required directly here, not colocated, matching precedent elsewhere in this migration.
import { buildUserAppliedListPipeline, buildAdminJobApplicantsListPipeline } from './professionals-job-applicants.queries'
import type { AddOrUpdateApplicationBody, AllAuthResult, UpdateStatusBody, UserTokenAuthResult } from './professionals-job-applicants.types'

const JobsM = require('../../../models/app/jobs/jobsM')
const CompanyM = require('../../../models/app/company/companyM')
const JobAppliedListM = require('../../../models/app/jobs/job_applied_listM')
const CommunityPostsM = require('../../../models/main/community/community_postsM')
const CoursesCertificatesM = require('../../../models/main/academy/courses_certificatesM')
const ProfessionalM = require('../../../models/app/professionalsM')
const { uploadDocumentFunc } = require('../../../utils/helpers/helper')
const { getUserProfileWithScore, sendJobApplicantEmail, sendJobAppliedEmail } = require('../../../utils/helpers/app_helper')

export async function addOrUpdateApplication(auth: UserTokenAuthResult, body: AddOrUpdateApplicationBody, preValidationErrors: Record<string, unknown>) {
  const errObj: Record<string, unknown> = { ...preValidationErrors }
  if (!auth.status) return { status: false, message: auth.message }

  const userRowId = Number.parseInt(String(auth.message))
  const jobId = Number.parseInt(String(body.job_id))

  const checkJobQuery = await JobsM.findOne({ _id: jobId, is_deleted: false, active_status: 'active' }, { _id: 1, company_row_id: 1, job_title: 1 })
  if (!checkJobQuery) errObj['job_id'] = 'Invalid Job ID or Job is inactive/deleted.'

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const companyRowId = checkJobQuery.company_row_id

  let resumeFile: string | null = null
  if (body.resume) {
    const uploadedResume = await uploadDocumentFunc(body.resume, 1)
    if (uploadedResume.status) {
      resumeFile = uploadedResume.path
    } else {
      return { status: false, message: 'Resume upload failed' }
    }
  }

  const certificateFiles: string[] = []
  if (Array.isArray(body.credentials) && body.credentials.length > 0) {
    for (const cert of body.credentials) {
      const uploadedCertificate = await uploadDocumentFunc(cert, 2)
      if (uploadedCertificate.status) {
        certificateFiles.push(uploadedCertificate.path)
      } else {
        return { status: false, message: 'Certificate upload failed' }
      }
    }
  }

  const applyPayload = {
    company_row_id: companyRowId,
    job_id: jobId,
    user_row_id: userRowId,
    linkedIn: body.linkedIn,
    salary_expectations: body.salary_expectations,
    highest_education: body.highest_education,
    key_skills: body.key_skills,
    resume: resumeFile,
    credentials: certificateFiles.length > 0 ? certificateFiles : null,
  }

  const existingApplication = await JobAppliedListM.findOne({ user_row_id: userRowId, job_id: jobId })

  if (existingApplication) {
    const updatedApp = await JobAppliedListM.findOneAndUpdate({ _id: existingApplication._id }, { $set: applyPayload }, { new: true })
    return { status: true, message: 'Job application updated successfully!', data: updatedApp }
  }

  const newApplication = new JobAppliedListM(applyPayload)
  await newApplication.save()

  const [company, user] = await Promise.all([
    CompanyM.findOne({ _id: companyRowId }, { company_name: 1, company_email_id: 1 }),
    ProfessionalM.findOne({ _id: userRowId }, { full_name: 1, email_id: 1 }),
  ])

  await Promise.all([
    sendJobApplicantEmail(
      { full_name: company?.company_name, email_id: company?.company_email_id },
      { name: user?.full_name, job_date: new Date(), job_role: checkJobQuery?.job_title },
      `https://image.coinpedia.org/${resumeFile}`,
    ),
    sendJobAppliedEmail(
      { full_name: user?.full_name, email_id: user?.email_id },
      { resume: `https://image.coinpedia.org/${resumeFile}`, company_name: company?.company_name, job_role: checkJobQuery?.job_title },
    ),
  ])

  return { status: true, message: 'Job applied successfully!', data: newApplication }
}

export async function getUserAppliedList(auth: AllAuthResult, skipRaw: string, limitRaw: string, queryUserRowIdRaw: unknown, companyRowIdRaw: unknown) {
  if (!auth.status) return { status: false, message: auth.message }

  const userRowId = auth.message.user_type === 1
    ? Number.parseInt(String(auth.message.user_row_id))
    : (Number.parseInt(String(queryUserRowIdRaw)) || 0)

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  const matchStage: Record<string, any> = { user_row_id: userRowId }
  if (companyRowIdRaw) matchStage.company_row_id = Number(companyRowIdRaw)

  const [totalCompletion, appliedJobs, totalCountResult, hasPosted, expertTag] = await Promise.all([
    getUserProfileWithScore(userRowId),
    JobAppliedListM.aggregate(buildUserAppliedListPipeline(matchStage, skip, limit)),
    JobAppliedListM.aggregate([{ $match: matchStage }, { $count: 'count' }]),
    CommunityPostsM.exists({ user_row_id: userRowId, post_status: true }),
    CoursesCertificatesM.exists({ user_row_id: userRowId }),
  ])

  const totalCount = totalCountResult[0]?.count || 0

  return {
    status: true,
    data: appliedJobs,
    profile_score: totalCompletion,
    count: totalCount,
    has_posted: Boolean(hasPosted),
    course_completed: Boolean(expertTag),
  }
}

export async function getJobApplicantsList(auth: AllAuthResult, skipRaw: string, limitRaw: string, query: Record<string, unknown>) {
  if (!auth.status) return { status: false, message: auth.message }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  const { company_row_id: companyRowIdRaw, job_id: jobIdRaw, salary_range: salaryRangeRaw, highest_education: highestEducationRaw, skills: skillsRaw, status: statusRaw, search: searchRaw } = query

  const matchStage: Record<string, any> = {}
  if (companyRowIdRaw) matchStage.company_row_id = Number(companyRowIdRaw)
  if (jobIdRaw) matchStage.job_id = Number(jobIdRaw)
  if (statusRaw) matchStage.status = statusRaw
  // Flagged, not fixed: this $or references "user_info.*", a field that only exists AFTER the
  // $lookup stage that comes later in the pipeline — since matchStage is applied in the pipeline's
  // FIRST $match (before any lookup runs), this search filter can never actually match anything.
  // Pre-existing, ported as-is.
  if (searchRaw && String(searchRaw).trim() !== '') {
    matchStage.$or = [
      { 'user_info.full_name': { $regex: searchRaw, $options: 'i' } },
      { 'user_info.user_name': { $regex: searchRaw, $options: 'i' } },
    ]
  }

  if (salaryRangeRaw) {
    switch (Number(salaryRangeRaw)) {
      case 1: matchStage.salary_expectations = { $lt: 30000 }; break
      case 2: matchStage.salary_expectations = { $gte: 30000, $lte: 50000 }; break
      case 3: matchStage.salary_expectations = { $gte: 50000, $lte: 80000 }; break
      case 4: matchStage.salary_expectations = { $gte: 80000, $lte: 120000 }; break
      case 5: matchStage.salary_expectations = { $gt: 120000 }; break
      default: break
    }
  }

  if (highestEducationRaw) matchStage.highest_education = Number(highestEducationRaw)
  if (skillsRaw) {
    const skillsArr = String(skillsRaw).split(',').map((id) => Number(id))
    matchStage.key_skills = { $in: skillsArr }
  }

  const [appliedJobs, totalCountResult] = await Promise.all([
    JobAppliedListM.aggregate(buildAdminJobApplicantsListPipeline(matchStage, skip, limit)),
    JobAppliedListM.aggregate([{ $match: matchStage }, { $count: 'count' }]),
  ])

  const totalCount = totalCountResult[0]?.count || 0

  return { status: true, data: appliedJobs, count: totalCount }
}

export async function updateApplicationStatus(auth: AllAuthResult, applicationId: string, body: UpdateStatusBody) {
  if (!auth.status) return { status: false, message: auth.message }

  const { status, rejected_reason: rejectedReason } = body
  if (!['approved', 'rejected', 'scheduled'].includes(status)) {
    return { status: false, message: 'Invalid status provided' }
  }

  const updateObj: Record<string, unknown> = { status, updatedAt: new Date() }
  updateObj['rejected_reason'] = status === 'rejected' ? rejectedReason : null

  const updated = await JobAppliedListM.findOneAndUpdate({ _id: applicationId }, { $set: updateObj }, { new: true })
  if (!updated) {
    return { status: false, message: 'Application not found' }
  }

  return { status: true, message: `Application ${status} successfully`, data: updated }
}
