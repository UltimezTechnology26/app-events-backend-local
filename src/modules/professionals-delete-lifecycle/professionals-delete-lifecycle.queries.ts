// modules/professionals-delete-lifecycle/professionals-delete-lifecycle.queries.ts
// Ported from controllers/admin_panel/app/user.js (~3537-3927).
import { PipelineStage } from 'mongoose'

export function buildDeleteRequestsMatchQuery(search?: string): object[] {
  const query: object[] = [{ login_status: 2 }]
  if (search) {
    query.push({
      $or: [
        { full_name: { $regex: search, $options: 'i' } },
        { user_name: { $regex: search, $options: 'i' } },
        { mobile_number: { $regex: search, $options: 'i' } },
        { email_id: { $regex: search, $options: 'i' } },
        { referral_user_name: { $regex: search, $options: 'i' } },
      ],
    })
  }
  return query
}

export function buildDeleteRequestsListPipeline(matchQuery: object[]): PipelineStage[] {
  return [
    { $match: { $and: matchQuery } },
    { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'co_info' } },
    { $unwind: { path: '$co_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'userImage' } },
    { $unwind: { path: '$userImage', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_created_by_admins', localField: '_id', foreignField: 'user_row_id', as: 'created_by_admin' } },
    { $unwind: { path: '$created_by_admin', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_auth_verify_emails', localField: '_id', foreignField: 'user_row_id', as: 'email_info' } },
    { $unwind: { path: '$email_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_delete_verifications', localField: '_id', foreignField: 'user_row_id', as: 'delInfo' } },
    { $unwind: { path: '$delInfo', preserveNullAndEmptyArrays: true } },
    { $set: { delete_date_n_time: '$delInfo.date_n_time' } },
    { $sort: { delete_date_n_time: 1 } },
    // Added 2026-09-15 (UX audit): matches the sub-admin-name lookup every sibling professionals
    // list pipeline already has - this one previously returned only the raw `sub_admin_row_id`.
    { $lookup: { from: 'cln_sub_admins', localField: 'sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, login_status: 1, created_date_n_time: 1, full_name: 1, pro_batch: 1, user_name: 1,
        mobile_number: 1, approval_status: 1, sub_admin_row_id: 1, sub_admin_name: '$sub_admin_info.full_name', email_id: 1,
        email_verify_status: '$email_info.email_verify_status', delete_date_n_time: 1,
        // Real gap fixed: `wallet_address` was typed on the frontend and even rendered as a
        // column, but never actually projected here - always silently showed "-". Confirmed the
        // field lives directly on the professional document (`update_wallet_address`'s own writes).
        wallet_address: 1,
        claim_status: '$created_by_admin.claim_status', country_name: '$co_info.country_name',
        country_flag: '$co_info.country_flag', profile_image: '$userImage.profile_image', referral_user_name: 1,
      },
    },
  ] as PipelineStage[]
}

export function buildDeletedListMatchQuery(search?: string): object {
  if (!search) return { action_type: 2 }
  return {
    $and: [
      { $or: [{ user_name: { $regex: search, $options: 'i' } }, { full_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] },
      { action_type: 2 },
    ],
  }
}

export function buildDeletedListPipeline(matchQuery: object): object[] {
  return [
    { $sort: { _id: -1 } },
    { $match: matchQuery },
    // CONFIRMED BUG FIX (2026-09-17): `email_verify_status` was typed on the frontend and
    // rendered as a column here, but was never actually projected - always showed the
    // unverified icon regardless of real status. Joined the real source of truth
    // (`cln_auth_verify_emails`), matching `buildDeleteRequestsListPipeline`'s own lookup above.
    { $lookup: { from: 'cln_auth_verify_emails', localField: 'user_row_id', foreignField: 'user_row_id', as: 'email_info' } },
    { $unwind: { path: '$email_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, user_row_id: 1, claim_email_id: 1, claim_request_status: 1, date_n_time: 1, user_name: 1, full_name: 1,
        approval_status: 1, email_id: 1, email_verify_status: '$email_info.email_verify_status',
      },
    },
  ]
}

function buildUserInfoMatch(search?: string): object {
  if (!search) return {}
  return { $or: [{ user_name: { $regex: search, $options: 'i' } }, { full_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] }
}

export function buildRecoveredListPipeline(search?: string): object[] {
  return [
    { $sort: { _id: -1 } },
    { $match: { action_type: 1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $match: { user_info: { $elemMatch: buildUserInfoMatch(search) } } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    // CONFIRMED BUG FIX (2026-09-17): `cln_professionals.email_verify_status` is never actually
    // updated by the verify-email flow (only `cln_auth_verify_emails`'s own copy is) - reading it
    // off `user_info` here always returned the stale `default: false`. Joined the real source of
    // truth, same fix already applied to `buildProfessionalListPipeline`/`buildDeleteRequestsListPipeline`.
    { $lookup: { from: 'cln_auth_verify_emails', localField: 'user_row_id', foreignField: 'user_row_id', as: 'email_info' } },
    { $unwind: { path: '$email_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, user_row_id: 1, claim_email_id: 1, claim_request_status: 1, date_n_time: 1,
        user_name: '$user_info.user_name', full_name: '$user_info.full_name',
        email_verify_status: '$email_info.email_verify_status', email_id: '$user_info.email_id',
      },
    },
  ]
}

export function buildRecoveredCountPipeline(search?: string): object[] {
  return [
    { $sort: { _id: -1 } },
    { $match: { action_type: 1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $match: { user_info: { $elemMatch: buildUserInfoMatch(search) } } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $count: 'count' },
  ]
}
