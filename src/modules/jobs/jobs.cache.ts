import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

/**
 * Mirrors legacy `controllers/app/jobs/job.js`'s exact 3 cache-bust calls on every LIVE job
 * write (create/update/delete/status-toggle) — not invoked when a write becomes a pending
 * change request instead, since nothing has changed live yet (same convention as every other
 * section this engagement wired up).
 */
export async function invalidateJobCaches(): Promise<void> {
  await deleteKeysByPattern('job_list_*')
  await deleteKeysByPattern('app_company_individual_other_details_*')
  await deleteKeysByPattern('app_company_list_*')
}
