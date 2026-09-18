const sanitize = require('mongo-sanitize')
const { calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')

import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { AUDIT_MODULE_COMPANY } from '../../common/status-audit/status-audit.registry'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../common/change-request/change-request.child.service'
import { SECTION_JOBS } from '../../common/change-request/change-request.registry'
import { invalidateJobCaches } from './jobs.cache'
import {
  findApprovedActiveCompany,
  findCompanyById,
  findLiveJob,
  findLiveJobLean,
  insertJob,
  setJobActiveStatusById,
  softDeleteJobById,
  updateJobById,
} from './jobs.queries'
import { Actor, JobActionResult, JobActiveStatus, SaveJobBody } from './jobs.types'

const ADMIN_ROW_ID_MAIN_ADMIN = 0
const USER_TYPE_COMPANY_OWNER = 1
const ACTIVE_STATUS_VALUES: readonly JobActiveStatus[] = ['active', 'inactive']

/**
 * Same actor-resolution shape as every other section this engagement wired up
 * (company.settings.service.ts's saveOrUpdateBasicCompanyDetails, team-members.service.ts's
 * adminCreateOrUpdateEmployeeDetails): `actor.message.user_row_id` is already 0 for a full admin
 * and the real admin_row_id for a subadmin (checkAllLoginToken's own normalization), so
 * ADMIN_ROW_ID_MAIN_ADMIN === 0 tells the two apart.
 */
function buildActorRef(actor: Extract<Actor, { status: true }>): ActorRef {
  const adminRowId = Number(actor.message.user_row_id)
  return toActorRefWithId(
    { updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin', updated_by_row_id: adminRowId },
    adminRowId,
  )
}

export interface CreateOrUpdateJobParams {
  actor: Actor
  body: SaveJobBody
  preValidationErrors: Record<string, string>
}

/**
 * Ports `controllers/app/jobs/job.js`'s `POST /add_n_update_details` (lines 17-130). The company-
 * ownership/approval validation, sanitization and response shapes are preserved exactly for the
 * OWNER (company's own team, `user_type === 1`) write path — still live, byte-identical. An admin
 * actor (`user_type === 2`, main admin or subadmin) now submits a change request instead of
 * writing straight to `cln_jobs`, same publish-gate shape as every other section.
 */
export async function createOrUpdateJob({ actor, body, preValidationErrors }: CreateOrUpdateJobParams): Promise<JobActionResult> {
  const errObj: Record<string, string> = { ...preValidationErrors }

  if (!actor.status) {
    return { status: false, message: actor.message }
  }

  const company_row_id = Number.parseInt(String(body.company_row_id))
  const checkCompanyQuery = await findApprovedActiveCompany(company_row_id)
  if (!checkCompanyQuery) {
    errObj['company_row_id'] = 'Invalid Company ID'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const jobPayload: Record<string, unknown> = {
    company_row_id,
    job_title: sanitize(body.job_title),
    experience_level: body.experience_level,
    job_type: body.job_type,
    work_location_type: body.work_location_type,
    country_id: body.country_id,
    location: body.location,
    salary_from: body.salary_from,
    salary_to: body.salary_to,
    no_of_openings: body.no_of_openings,
    application_deadline: body.application_deadline,
    highest_education: body.highest_education,
    key_skills: body.key_skills,
    job_description: sanitize(body.job_description),
  }

  const job_id = body.job_id ? Number.parseInt(String(body.job_id)) : undefined

  if (actor.message.user_type !== USER_TYPE_COMPANY_OWNER) {
    const liveValues = job_id ? ((await findLiveJobLean(job_id)) ?? {}) : {}
    return submitChildChangeRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_JOBS,
      rootDocumentId: company_row_id,
      targetRowId: job_id ?? null,
      liveValues,
      submitted: jobPayload,
      actor: buildActorRef(actor),
    })
  }

  if (job_id) {
    const result = await updateJobById(job_id, jobPayload)
    await invalidateJobCaches()
    if (!result) {
      return { status: false, message: 'Job not found for update.' }
    }
    return { status: true, message: 'Job updated successfully!' }
  }

  const result = await insertJob(jobPayload)
  await invalidateJobCaches()
  await calculateCompanyProfileScore(company_row_id, ['job_opening'])
  return { status: true, message: 'Job created successfully!', data: result }
}

export interface DeleteJobParams {
  actor: Actor
  jobId: number
  companyRowIdQuery: number | null
}

/**
 * Ports `controllers/app/jobs/job.js`'s `GET /delete/:job_id` (lines 132-172) — a SOFT delete
 * (`is_deleted: true`), never a real Mongo delete, preserved exactly for the owner path. An admin
 * actor previously bypassed the ownership check entirely and deleted immediately; now submits a
 * delete change request instead (change-request.apply.writers.ts's softDeleteField branch applies
 * the same `is_deleted: true` $set on publish, not a real removal, matching this section's own
 * live semantics).
 */
export async function deleteJob({ actor, jobId, companyRowIdQuery }: DeleteJobParams): Promise<JobActionResult> {
  if (!actor.status) {
    return { status: false, message: actor.message }
  }

  const job = await findLiveJob(jobId)
  if (!job) {
    return { status: false, message: 'Job not found or already deleted.' }
  }

  const company = await findCompanyById(job.company_row_id)
  if (!company) {
    return { status: false, message: 'Company not found.' }
  }

  if (actor.message.user_type === USER_TYPE_COMPANY_OWNER) {
    if (company._id !== companyRowIdQuery) {
      return { status: false, message: 'You are not authorized to update this job.' }
    }
    await softDeleteJobById(jobId)
    await invalidateJobCaches()
    await calculateCompanyProfileScore(job.company_row_id, ['job_opening'])
    return { status: true, message: 'Job deleted successfully' }
  }

  return submitChildDeleteRequest({
    module: AUDIT_MODULE_COMPANY,
    section: SECTION_JOBS,
    rootDocumentId: job.company_row_id,
    targetRowId: jobId,
    rowSnapshot: typeof job.toObject === 'function' ? job.toObject() : { ...job },
    actor: buildActorRef(actor),
  })
}

export interface SetJobActiveStatusParams {
  actor: Actor
  jobId: number
  companyRowIdQuery: number | null
  activeStatus: string
}

/**
 * Ports `controllers/app/jobs/job.js`'s `POST /job_status/:job_id` (lines 174-224). Same
 * owner-vs-admin split as deleteJob above — an admin actor now submits a single-field change
 * request (`active_status`) instead of writing it live.
 */
export async function setJobActiveStatus({ actor, jobId, companyRowIdQuery, activeStatus }: SetJobActiveStatusParams): Promise<JobActionResult> {
  if (!actor.status) {
    return { status: false, message: actor.message }
  }

  if (!ACTIVE_STATUS_VALUES.includes(activeStatus as JobActiveStatus)) {
    return { status: false, message: 'Invalid active_status value' }
  }

  const job = await findLiveJob(jobId)
  if (!job) {
    return { status: false, message: 'Job not found or deleted.' }
  }

  const company = await findCompanyById(job.company_row_id)
  if (!company) {
    return { status: false, message: 'Company not found.' }
  }

  if (actor.message.user_type === USER_TYPE_COMPANY_OWNER) {
    if (company._id !== companyRowIdQuery) {
      return { status: false, message: 'You are not authorized to update this job.' }
    }
    await setJobActiveStatusById(jobId, activeStatus)
    await invalidateJobCaches()
    return { status: true, message: `Job status updated to ${activeStatus}` }
  }

  return submitChildChangeRequest({
    module: AUDIT_MODULE_COMPANY,
    section: SECTION_JOBS,
    rootDocumentId: job.company_row_id,
    targetRowId: jobId,
    liveValues: { active_status: job.active_status },
    submitted: { active_status: activeStatus },
    actor: buildActorRef(actor),
  })
}
