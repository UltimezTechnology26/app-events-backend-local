const jobsM = require('../../../models/app/jobs/jobsM')
const companyM = require('../../../models/app/company/companyM')

export async function findApprovedActiveCompany(companyRowId: number): Promise<{ _id: number; user_row_id: number } | null> {
  return companyM.findOne({ _id: companyRowId, approval_status: 1, active_status: 1 }, { _id: 1, user_row_id: 1 })
}

export async function findCompanyById(companyRowId: number): Promise<{ _id: number } | null> {
  return companyM.findOne({ _id: companyRowId })
}

/** Hydrated Mongoose document (not `.lean()`) — callers needing `row_snapshot`/`toObject()` use this one. */
export async function findLiveJob(jobId: number) {
  return jobsM.findOne({ _id: jobId, is_deleted: false })
}

export async function findLiveJobLean(jobId: number) {
  return jobsM.findOne({ _id: jobId, is_deleted: false }).lean()
}

export async function insertJob(payload: Record<string, unknown>) {
  const job = new jobsM({ ...payload, active_status: 'active' })
  return job.save()
}

export async function updateJobById(jobId: number, payload: Record<string, unknown>) {
  return jobsM.findOneAndUpdate({ _id: jobId }, { $set: payload }, { new: true })
}

export async function softDeleteJobById(jobId: number) {
  return jobsM.updateOne({ _id: jobId }, { $set: { is_deleted: true } })
}

export async function setJobActiveStatusById(jobId: number, activeStatus: string) {
  return jobsM.updateOne({ _id: jobId }, { $set: { active_status: activeStatus } })
}
