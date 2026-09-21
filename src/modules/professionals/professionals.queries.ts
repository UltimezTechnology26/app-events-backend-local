// modules/professionals/professionals.queries.ts
//
// Query builders for user.js's /users_pages (~2099-2166), /create_new_user (~2166-2353),
// /update_user (~2353-2573), /enable_user (~2573-2654), /disable_user (~2654-2756), and
// /public_status_list (~4593-4618).
import { ProfessionalCreatedByAdminM, ProfessionalM } from './professionals.models'

/** Ports /users_pages's aggregation (~2099-2166) verbatim — small table (admin-created link rows), no pagination in the real route either, not added here to avoid a response-shape change for this specific listing. */
export function buildUsersPagesPipeline(search?: string) {
  const matchQuery: Record<string, unknown> = search
    ? {
        $or: [
          { user_name: { $regex: search, $options: 'i' } },
          { full_name: { $regex: search, $options: 'i' } },
          { email_id: { $regex: search, $options: 'i' } },
          { mobile_number: { $regex: search, $options: 'i' } },
          { country_name: { $regex: search, $options: 'i' } },
        ],
      }
    : {}

  return [
    { $match: matchQuery },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_countries', localField: 'user_info.country_id', foreignField: '_id', as: 'co_info' } },
    { $unwind: { path: '$co_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        user_row_id: 1,
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        mobile_number: '$user_info.mobile_number',
        date_n_time: '$user_info.date_n_time',
        login_status: '$user_info.login_status',
        country_name: '$co_info.country_name',
        country_flag: '$co_info.country_flag',
      },
    },
  ]
}

export function getUsersPagesList(search?: string) {
  return ProfessionalCreatedByAdminM.aggregate(buildUsersPagesPipeline(search))
}

/**
 * CONFIRMED BUG FIX (Phase A, per plan): /update_user (~2395-2416) ran 3 SEQUENTIAL `findOne`
 * calls to check username/email/mobile uniqueness against every other professional. One `$or`
 * query with a projection replaces all 3 — same uniqueness semantics (excludes the row being
 * updated via `_id: {$ne: userRowId}`), one round-trip instead of up to 3.
 */
export function findConflictingUserFields({ userRowId, userName, emailId, mobileNumber }: { userRowId: number; userName: string; emailId?: string; mobileNumber?: string }) {
  const or: Record<string, unknown>[] = [{ user_name: userName }]
  if (emailId) or.push({ email_id: emailId })
  if (mobileNumber) or.push({ mobile_number: mobileNumber })

  return ProfessionalM.find({ _id: { $ne: userRowId }, $or: or }, { user_name: 1, email_id: 1, mobile_number: 1 })
}

/** Same combined-$or check for /create_new_user, minus the self-exclusion (no row exists yet). CONFIRMED PERF FIX applied consistently with /update_user, even though the plan named only /update_user's version explicitly — the create route has the exact same 3-sequential-findOne shape. */
export function findConflictingUserFieldsForCreate({ userName, emailId, mobileNumber }: { userName: string; emailId?: string; mobileNumber?: string }) {
  const or: Record<string, unknown>[] = [{ user_name: userName }]
  if (emailId) or.push({ email_id: emailId })
  if (mobileNumber) or.push({ mobile_number: mobileNumber })

  return ProfessionalM.find({ $or: or }, { user_name: 1, email_id: 1, mobile_number: 1 })
}
