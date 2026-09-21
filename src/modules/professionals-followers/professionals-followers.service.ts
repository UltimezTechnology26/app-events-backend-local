// modules/professionals-followers/professionals-followers.service.ts
// Ports controllers/app/users/followers.js's 9 routes (~16-1444) plus
// controllers/admin_panel/app/user.js's /user_followers (~1499-1640) and /login_into_account
// (~258-320) — the two admin routes flagged in Phase A's header comment for using inconsistent
// permission ids ([10] and [0]). Same behavior, same response shapes throughout.
import ProfessionalM from '../../../models/app/professionalsM'
import ProfessionalsFollowersM from '../../../models/app/professionals_followersM'
import DefaultProfileImgM from '../../../models/app/static/default_profile_imgM'
import CompanyFollowersM from '../../../models/app/company/followersM'
import {
  buildFollowersListPipeline, buildFollowingListPipeline, buildFollowRequestsPendingListPipeline,
  buildCompanyFollowingListPipeline, buildCompanyFollowingMatchQuery,
  buildAdminUserFollowersListPipeline, buildAdminUserFollowersCountPipeline,
  buildViewUserPipeline,
} from './professionals-followers.queries'
import {
  getCache, setCache, LIST_CACHE_TTL_SECONDS,
  buildFollowersListKey, buildFollowingListKey, buildFollowRequestsPendingListKey, buildCompanyFollowingListKey,
  invalidateFollowersCaches,
} from './professionals-followers.cache'
import type { UserAuthResult, AdminAuthResult } from './professionals-followers.types'

const CompanyM = require('../../../models/app/company/companyM')
const ProfessionalProfileImagesM = require('../../../models/app/professionals_profile_imagesM')
const { sendEmail } = require('../../../config/email')
const { updateNotification, updateThreadNotification } = require('../../../utils/helpers/notification_helper')
const { deleteUserFollowers } = require('../../../utils/helpers/app_helper')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
const { generateUserLoginToken } = require('../../../middleware/authorization')

function resolveUserRowId(auth: UserAuthResult, queryUserRowIdRaw: unknown): number {
  if (!auth.status) return 0
  if (auth.message.user_type === 1) return auth.message.user_row_id
  const parsed = Number.parseInt(queryUserRowIdRaw as string)
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function getFollowersList(auth: UserAuthResult, queryUserRowIdRaw: unknown, search?: string) {
  if (!auth.status) return auth
  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)

  const key = buildFollowersListKey(userRowId, search)
  const cached = await getCache({ key })
  if (cached.status) return { status: true, message: cached.message, cache_reponse_status: true }

  const list = await ProfessionalsFollowersM.aggregate(buildFollowersListPipeline(userRowId, search))
  await setCache({ key, value: list, ttl: LIST_CACHE_TTL_SECONDS })
  return { status: true, message: list, cache_reponse_status: false }
}

export async function getFollowingList(auth: UserAuthResult, queryUserRowIdRaw: unknown, search?: string) {
  if (!auth.status) return auth
  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)

  const key = buildFollowingListKey(userRowId, search)
  const cached = await getCache({ key })
  if (cached.status) return { status: true, message: cached.message, cache_reponse_status: true }

  const list = await ProfessionalsFollowersM.aggregate(buildFollowingListPipeline(userRowId, search))
  await setCache({ key, value: list, ttl: LIST_CACHE_TTL_SECONDS })
  return { status: true, message: list, cache_reponse_status: false }
}

export async function getFollowRequestsPendingList(auth: UserAuthResult, queryUserRowIdRaw: unknown, search?: string) {
  if (!auth.status) return auth
  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)

  const key = buildFollowRequestsPendingListKey(userRowId, search)
  const cached = await getCache({ key })
  if (cached.status) return { status: true, message: cached.message, cache_reponse_status: true }

  const list = await ProfessionalsFollowersM.aggregate(buildFollowRequestsPendingListPipeline(userRowId, search))
  await setCache({ key, value: list, ttl: LIST_CACHE_TTL_SECONDS })
  return { status: true, message: list, cache_reponse_status: false }
}

export async function getCompanyFollowingList(auth: UserAuthResult, queryUserRowIdRaw: unknown, search?: string) {
  if (!auth.status) return auth
  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)

  const key = buildCompanyFollowingListKey(userRowId, search)
  const cached = await getCache({ key })
  if (cached.status) return { status: true, message: cached.message, cache_reponse_status: true }

  const matchQuery = buildCompanyFollowingMatchQuery(userRowId, search)
  const list = await CompanyFollowersM.aggregate(buildCompanyFollowingListPipeline(matchQuery))
  await setCache({ key, value: list, ttl: LIST_CACHE_TTL_SECONDS })
  return { status: true, message: list, cache_reponse_status: false }
}

// FLAGGED, NOT FIXED (real, confirmed bug): legacy fetches the followed professional's name/email
// for the "New Follower" notification email via `professionalsM.find(...)` (returns an ARRAY) but
// then reads `.full_name`/`.email_id` directly off that array — both always `undefined`. The
// notification email this route sends is therefore always addressed to `undefined` with a blank
// name. Ported as-is (same `.find` call, same undefined access): switching to `.findOne` would be
// a real behavior change (the email would actually start reaching someone) needing sign-off first.
export async function followUser(checkUserToken: { status: true; message: number } | { status: false; message: unknown }, followingUserRowIdRaw: string) {
  if (!checkUserToken.status) return checkUserToken
  const userRowId = checkUserToken.message
  const followingUserRowId = Number.parseInt(followingUserRowIdRaw)
  if (Number.isNaN(followingUserRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const queryRun: any = await ProfessionalM.findOne({ login_status: 1, _id: followingUserRowId }, { full_name: 1, account_visible_type: 1 })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User Row ID.' }, tokenStatus: true }
  }

  const followerUserName = queryRun.full_name
  const accountVisibleType = queryRun.account_visible_type

  if (userRowId === followingUserRowId) {
    return { status: false, message: { alert_message: 'Sorry, You are following your account only.' }, tokenStatus: true }
  }

  const followerQuery = await ProfessionalsFollowersM.findOne({ follower_user_row_id: userRowId, following_user_row_id: followingUserRowId })
  if (followerQuery) {
    return { status: false, message: { alert_message: 'Already followed..' }, tokenStatus: true }
  }

  const insertArray = { follower_user_row_id: userRowId, following_user_row_id: followingUserRowId, confirm_request_status: accountVisibleType, date_n_time: getPresentDateTime() }
  const messageRowId = accountVisibleType === 1 ? 8 : 7

  const saveArray: any = await ProfessionalsFollowersM(insertArray).save()
  await invalidateFollowersCaches()

  await updateThreadNotification({ user_row_id: followingUserRowId, notify_type: 1, notify_type_row_id: userRowId, message_row_id: messageRowId, action_row_id: saveArray._id })

  // `.find` (array) ported as-is — see doc comment above.
  const followingUserNameQuery: any = await ProfessionalM.find({ _id: followingUserRowId })
  const followingUserName = (followingUserNameQuery as any).full_name
  const followingUserEmailId = (followingUserNameQuery as any).email_id

  const totalFollowers = await ProfessionalsFollowersM.countDocuments({ following_user_row_id: followingUserRowId, confirm_request_status: 2 })

  const passSubject = 'Heya! You have a New Follower.'
  const passMessage = `<div style="background:#fff;padding:40px 50px 30px;font-size:14px;line-height:1.4; border-radius: 5px;">
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hi ${followingUserName},</p>
                            <div style="color:#000">
                                <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${followerUserName}</b> Started Following you on the Coinpedia pro account profile. </p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Your total followers are ${totalFollowers}.</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;"> Login to know more.</p>
                            </div>
                            </div>`
  await sendEmail(followingUserEmailId, passSubject, passMessage)

  return {
    status: true,
    insert_array: insertArray,
    message: { alert_message: 'You have successfully followed the user. Thank you for your involvement!', following_full_name: followerUserName },
    confirm_request_status: queryRun.account_visible_type,
    tokenStatus: true,
  }
}

export async function confirmRequest(checkUserToken: { status: true; message: number } | { status: false; message: unknown }, followingUserRowIdRaw: string) {
  if (!checkUserToken.status) return checkUserToken
  const userRowId = checkUserToken.message
  const followingUserRowId = Number.parseInt(followingUserRowIdRaw)
  if (Number.isNaN(followingUserRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const queryRun: any = await ProfessionalsFollowersM.findOne({ follower_user_row_id: followingUserRowId, following_user_row_id: userRowId, confirm_request_status: 1 })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Invalid Following User Row ID' }, tokenStatus: true }
  }

  await updateNotification({ user_row_id: followingUserRowId, notify_type: 1, notify_type_row_id: userRowId, message_row_id: 12, action_row_id: queryRun._id })
  await ProfessionalsFollowersM.updateOne({ follower_user_row_id: followingUserRowId, following_user_row_id: userRowId }, { $set: { confirm_request_status: 2 } })
  await invalidateFollowersCaches()

  return { status: true, message: { alert_message: 'You have successfully accepted the following request from this user. Thank you for your involvement!' }, tokenStatus: true }
}

export async function deleteFollowRequest(checkUserToken: { status: true; message: number } | { status: false; message: unknown }, followerUserRowIdRaw: string) {
  if (!checkUserToken.status) return checkUserToken
  const userRowId = checkUserToken.message
  const followerUserRowId = Number.parseInt(followerUserRowIdRaw)
  if (Number.isNaN(followerUserRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const queryRun = await ProfessionalsFollowersM.findOne({ follower_user_row_id: followerUserRowId, following_user_row_id: userRowId, confirm_request_status: 1 })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Something went wrong please check your inputs.' }, tokenStatus: true }
  }

  await ProfessionalsFollowersM.deleteOne({ follower_user_row_id: followerUserRowId, following_user_row_id: userRowId, confirm_request_status: 1 })
  await invalidateFollowersCaches()

  return { status: true, message: { alert_message: 'The following request has been successfully deleted. Thank you for your action!' }, tokenStatus: true }
}

export async function unfollowUser(checkUserToken: { status: true; message: number } | { status: false; message: unknown }, userRowIdRaw: string) {
  if (!checkUserToken.status) return checkUserToken
  const followerUserRowId = checkUserToken.message
  const userRowId = Number.parseInt(userRowIdRaw)

  // FLAGGED, NOT FIXED (pre-existing, cosmetic-only): legacy validates `!Number.isNaN(follower_user_row_id)`
  // (always a valid number — it comes from the verified JWT, never the raw param) instead of
  // `user_row_id` (the actual route param that can be invalid). Ported as-is: the practical effect
  // is that this branch never rejects an invalid `:user_row_id`, it just proceeds with `user_row_id`
  // as `NaN` and lets the downstream queries silently match nothing.
  if (Number.isNaN(followerUserRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const followingUserQuery: any = await ProfessionalM.findOne({ _id: userRowId }, { full_name: 1 })
  const followingFullName = followingUserQuery ? followingUserQuery.full_name : ''

  const queryRun = await ProfessionalsFollowersM.findOne({ follower_user_row_id: followerUserRowId, following_user_row_id: userRowId })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Already unfollowed..' }, tokenStatus: true }
  }

  await deleteUserFollowers({ type: 1, follower_user_row_id: followerUserRowId, user_row_id: userRowId })
  const invalidationResults = await invalidateFollowersCaches()
  const deleteCache = invalidationResults[0] // 'app_users_list_*' result — the only route that echoes this back, matching legacy exactly

  return { status: true, delete_cache: deleteCache, message: { alert_message: 'This user has been successfully removed from your following list.', following_full_name: followingFullName }, tokenStatus: true }
}

export async function removeUserFromFollower(checkUserToken: { status: true; message: number } | { status: false; message: unknown }, userRowIdRaw: string) {
  if (!checkUserToken.status) return checkUserToken
  const followerUserRowId = checkUserToken.message
  const userRowId = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(userRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const queryRun = await ProfessionalsFollowersM.findOne({ follower_user_row_id: userRowId, following_user_row_id: followerUserRowId, confirm_request_status: 2 })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'User already removed from followers list.' }, tokenStatus: true }
  }

  await deleteUserFollowers({ type: 1, follower_user_row_id: userRowId, user_row_id: followerUserRowId })
  await invalidateFollowersCaches()

  return { status: true, message: { alert_message: 'This user has been successfully removed from your followers. Thank you for managing your followers!' }, tokenStatus: true }
}

// FLAGGED, NOT FIXED (real, confirmed bug): legacy's `if (queryRun) {...}` is always true (an
// aggregate result is always an array, even empty), so the success branch always runs AND a second,
// unconditional `res.json({status:false, tokenStatus:true})` runs right after it — the second send
// throws "Cannot set headers after they are sent" internally (caught by the outer catch, but only
// after the first response already reached the client, so it has no externally-observable effect).
// For an invalid/non-existent `view_user_row_id`, `queryRun[0]` is `undefined` and the very next
// line throws a TypeError reading `.profile_image_type` off it — caught by the outer catch,
// producing the generic error response. Ported as-is: ported logic below reproduces exactly what a
// real client receives in both cases (the success payload on success; the generic error on an
// invalid id) without literally reproducing the harmless double-send.
export async function viewUser(checkUserToken: { status: true; message: number } | { status: false; message: unknown }, viewUserRowIdRaw: string) {
  if (!checkUserToken.status) return checkUserToken
  const loginUserRowId = checkUserToken.message
  const viewUserRowId = Number.parseInt(viewUserRowIdRaw)
  if (Number.isNaN(viewUserRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const queryRun: any[] = await ProfessionalM.aggregate(buildViewUserPipeline(viewUserRowId))
  const row = queryRun[0] // throws below if undefined, matching legacy's unguarded access

  const innerObj: Record<string, unknown> = {}
  if (row.profile_image_type > 0) {
    const defaultImageQuery: any = await DefaultProfileImgM.findOne({ _id: row.profile_image_type })
    if (defaultImageQuery) innerObj['profile_image'] = defaultImageQuery.image_name
  }

  const [totalFollowing, totalFollowers] = await Promise.all([
    ProfessionalsFollowersM.countDocuments({ follower_user_row_id: viewUserRowId }),
    ProfessionalsFollowersM.countDocuments({ following_user_row_id: viewUserRowId }),
  ])

  innerObj['user_name'] = row.user_name
  innerObj['full_name'] = row.full_name
  innerObj['email_id'] = row.email_id
  innerObj['mobile_number'] = row.mobile_number
  innerObj['country_id'] = row.country_id
  innerObj['gender'] = row.gender
  innerObj['user_bio'] = row.user_bio
  innerObj['location'] = row.location
  innerObj['profile_image'] = row.profile_image
  innerObj['profile_image_type'] = row.profile_image_type
  innerObj['total_following'] = totalFollowing
  innerObj['total_followers'] = totalFollowers
  innerObj['confirm_request_status'] = 0

  const presentFollowQuery: any = await ProfessionalsFollowersM.findOne({ follower_user_row_id: loginUserRowId, following_user_row_id: viewUserRowId }, { confirm_request_status: 1 })
  if (presentFollowQuery) innerObj['confirm_request_status'] = presentFollowQuery.confirm_request_status

  return { status: true, message: innerObj, tokenStatus: true, image_base_url: 'uploads/profile/' }
}

// --- Admin-panel routes (permission ids preserved exactly, NOT normalized — see doc comment) ---

// NOTE ON PERMISSION IDS [10]/[0]: Phase A's header comment flagged these as "inconsistent" with
// every other professionals route's `[1]`. Investigated further while building this module:
// `checkAdminLoginToken` only consults the access-id array for sub-admins (`admin_manager_type ===
// 2`) — a full admin (`admin_manager_type === 1`) always passes regardless. So `[10]`/`[0]` aren't
// a broken/weaker check, they're distinct GRANTED-PERMISSION FLAGS a sub-admin must specifically
// have — quite possibly deliberate least-privilege (e.g. "can view a professional's followers" or
// "can log in as a user" gated separately from "can manage professionals" generally). Normalizing
// them to `[1]` would WIDEN access for any sub-admin who has the general professionals permission
// but was never granted these specific ones — a real security-relevant behavior change. Preserved
// exactly as legacy has them; flagged for the user's judgment call, not silently changed either way.
export async function getAdminUserFollowersList(auth: AdminAuthResult, userRowId: number, search?: string) {
  if (!auth.status) return auth
  if (Number.isNaN(userRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid user row id' } }
  }

  // CONFIRMED PERF FIX: legacy runs the list aggregate then the count aggregate sequentially —
  // independent of each other, Promise.all'd here.
  const [followersList, countResult] = await Promise.all([
    ProfessionalsFollowersM.aggregate(buildAdminUserFollowersListPipeline(userRowId, search)),
    ProfessionalsFollowersM.aggregate(buildAdminUserFollowersCountPipeline(userRowId, search)),
  ])

  return { status: true, message: followersList, count: countResult[0]?.count || 0 }
}

export async function loginIntoAccount(auth: AdminAuthResult, userRowId: number) {
  if (!auth.status) return auth
  if (Number.isNaN(userRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid user row id.' } }
  }

  const rowData: any = await ProfessionalM.findOne({ _id: userRowId })
  if (!rowData) {
    return { status: false, message: { alert_message: 'Sorry, Invalid user row id.' } }
  }

  const resArray: Record<string, unknown> = {
    token: generateUserLoginToken(userRowId, 1),
    _id: userRowId,
    referral_row_id: rowData.referral_row_id,
    referral_user_name: rowData.referral_user_name,
    user_name: rowData.user_name,
    full_name: rowData.full_name,
    email_id: rowData.email_id,
    mobile_number: rowData.mobile_number,
    company_name: rowData.company_name,
    work_position: rowData.work_position,
    login_status: 1,
    approval_status: rowData.approval_status,
    created_date_n_time: rowData.created_date_n_time,
    company_listed_status: 0,
    email_verify_status: true,
  }

  // CONFIRMED PERF FIX: legacy runs these two independent existence checks sequentially —
  // Promise.all'd here.
  const [companyQuery, imageQueryRun] = await Promise.all([
    CompanyM.findOne({ user_row_id: userRowId }),
    ProfessionalProfileImagesM.findOne({ user_row_id: userRowId }),
  ])

  resArray['company_listed_status'] = companyQuery ? 1 : 0
  resArray['profile_image'] = imageQueryRun ? imageQueryRun.profile_image : ''

  return { status: true, message: resArray }
}
