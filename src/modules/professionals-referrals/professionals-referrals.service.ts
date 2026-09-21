// modules/professionals-referrals/professionals-referrals.service.ts
// Ports controllers/app/users/referrals.js's GET /list/:skip/:limit.
// professionalsM is core and shared across many still-live legacy files — required directly, not
// colocated, matching precedent elsewhere in this migration (e.g. professionals-points).
import { buildReferralsListPipeline } from './professionals-referrals.queries'

const ProfessionalM = require('../../../models/app/professionalsM')

export interface UserTokenAuthFailure {
  status: false
  message: string
}
export interface UserTokenAuthSuccess {
  status: true
  message: number
}
export type UserTokenAuthResult = UserTokenAuthSuccess | UserTokenAuthFailure

export async function getReferralsList(auth: UserTokenAuthResult, skipRaw: unknown, limitRaw: unknown, startDateRaw: unknown, endDateRaw: unknown) {
  if (!auth.status) return auth

  const skip = !Number.isNaN(Number.parseInt(String(skipRaw))) ? Number.parseInt(String(skipRaw)) : 0
  const limit = !Number.isNaN(Number.parseInt(String(limitRaw))) ? Number.parseInt(String(limitRaw)) : 100
  const userRowId = auth.message

  const matchQuery: Record<string, any> = { referral_row_id: userRowId, login_status: 1 }
  if (startDateRaw || endDateRaw) {
    matchQuery.created_date_n_time = {}
    if (startDateRaw) matchQuery.created_date_n_time.$gte = new Date(`${startDateRaw}T00:00:00.000Z`)
    if (endDateRaw) matchQuery.created_date_n_time.$lte = new Date(`${endDateRaw}T23:59:59.999Z`)
  }

  // Perf fix: legacy ran these two independent queries sequentially — parallelized, same class of
  // fix as every prior phase in this migration.
  const [queryRun, countQuery] = await Promise.all([
    ProfessionalM.aggregate(buildReferralsListPipeline(matchQuery)).skip(skip).limit(limit),
    ProfessionalM.countDocuments(matchQuery),
  ])

  return { status: true, message: queryRun, count: countQuery }
}
