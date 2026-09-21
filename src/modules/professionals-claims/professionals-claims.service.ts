// modules/professionals-claims/professionals-claims.service.ts
// Ports controllers/admin_panel/app/user.js's 8 claim-request routes (~3928-4535). Same behavior,
// same response shapes — confirmed perf fixes noted inline; confirmed pre-existing bugs flagged,
// not silently fixed. Owns no colocated model — professionals_claimed_requestM is already
// directly imported (not colocated) by professionals.overview.queries.ts, app_helper.js, and
// link_pages.js, so this module does the same rather than claiming exclusive ownership.
import ProfessionalM from '../../../models/app/professionalsM'
import {
  buildPendingListPipeline, buildPendingCountPipeline, buildPendingMatchQuery,
  buildApprovedListPipeline, buildApprovedCountPipeline,
  buildRejectedListPipeline, buildRejectedCountPipeline,
  buildViewClaimPipeline,
} from './professionals-claims.queries'
import type { AdminAuthResult } from './professionals-claims.types'

const ProfessionalsClaimedRequestM = require('../../../models/app/professionals_claimed_requestM')
const { checkUserSubadminAccess } = require('../../../utils/helpers/helper')
const { sendEmail } = require('../../../config/email')

function parsePaging(skipRaw: string, limitRaw: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { skip, limit }
}

export async function getPendingList(skipRaw: string, limitRaw: string, search?: string) {
  const { skip, limit } = parsePaging(skipRaw, limitRaw)
  const matchQuery = buildPendingMatchQuery(search)
  // CONFIRMED PERF FIX: legacy runs the list aggregate then the count aggregate sequentially —
  // independent of each other, Promise.all'd here (same class of fix as every prior phase).
  const [list, countResult] = await Promise.all([
    ProfessionalsClaimedRequestM.aggregate(buildPendingListPipeline(matchQuery)).skip(skip).limit(limit),
    ProfessionalsClaimedRequestM.aggregate(buildPendingCountPipeline(matchQuery)),
  ])
  return { status: true, message: list, count: countResult[0]?.count || 0 }
}

export async function getApprovedList(skipRaw: string, limitRaw: string, search?: string) {
  const { skip, limit } = parsePaging(skipRaw, limitRaw)
  const [list, countResult] = await Promise.all([
    ProfessionalsClaimedRequestM.aggregate(buildApprovedListPipeline(search)).skip(skip).limit(limit),
    ProfessionalsClaimedRequestM.aggregate(buildApprovedCountPipeline(search)),
  ])
  return { status: true, message: list, count: countResult[0]?.count || 0 }
}

export async function getRejectedList(skipRaw: string, limitRaw: string, search?: string) {
  const { skip, limit } = parsePaging(skipRaw, limitRaw)
  const [list, countResult] = await Promise.all([
    ProfessionalsClaimedRequestM.aggregate(buildRejectedListPipeline(search)).skip(skip).limit(limit),
    ProfessionalsClaimedRequestM.aggregate(buildRejectedCountPipeline(search)),
  ])
  return { status: true, message: list, count: countResult[0]?.count || 0 }
}

function buildSubadminAccessParams(auth: AdminAuthResult & { status: true }, userRowId: number) {
  return {
    admin_row_id: Number.parseInt(auth.message.admin_row_id as string),
    admin_manager_type: auth.message.admin_manager_type,
    sub_admin_type: Number.parseInt(auth.message.sub_admin_type as string),
    user_row_id: userRowId,
  }
}

// FLAGGED, NOT FIXED (two real, confirmed bugs, both preserved bug-for-bug):
// (1) the reject-reason email interpolates `req.body.reason_rejected` — a typo of the actual
//     validated/saved field `rejected_reason` — so the reason shown in the email is always
//     "undefined", never the admin's real input.
// (2) the email greeting is the literal string "Hello User," instead of `${full_name}`, even
//     though `full_name` is fetched via `checkActiveUser` right above it and used correctly by
//     the sibling `rejectClaim` (GET) route below.
// Both are real behavior, not hypothetical — fixing either would change the email content sent to
// real users, which needs explicit sign-off, not a silent migration-time "improvement".
export async function rejectRequest(auth: AdminAuthResult, requestRowId: number, rejectedReason: unknown, preValidationErrors: Record<string, unknown>) {
  const errObj = { ...preValidationErrors }
  if (!auth.status) errObj['alert_message'] = auth.message

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const checkRequest: any = await ProfessionalsClaimedRequestM.findOne({ _id: requestRowId, claim_request_status: 1 })
  if (!checkRequest) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  const userRowId = Number.parseInt(checkRequest.user_row_id)
  const claimEmailId = checkRequest.claim_email_id
  const checkAccess = await checkUserSubadminAccess(buildSubadminAccessParams(auth as any, userRowId))
  if (!checkAccess.status) {
    return { status: false, message: { alert_message: checkAccess.message } }
  }

  // CONFIRMED PERF FIX: legacy awaits the status update, then separately awaits fetching
  // full_name for the email — independent of each other, Promise.all'd here.
  const [, checkActiveUser] = await Promise.all([
    ProfessionalsClaimedRequestM.updateOne({ _id: requestRowId }, { $set: { claim_request_status: 3, claim_rejected_reason: rejectedReason } }),
    ProfessionalM.findOne({ _id: userRowId }, { full_name: 1 }),
  ])

  const passSubject = 'Your CoinPedia User Profile Claim Request Rejected! '
  const passMessage = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello User,</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your claim request for a CoinPedia </b>${checkActiveUser?.full_name}</p> user account has been rejected by our admin.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reject Reason : </b>${(rejectedReason as any)}</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Please check all your entered details once again, and submit a request to claim the user profile.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Do Not Reply To This Email.</p>
                    `
  await sendEmail(claimEmailId, passSubject, passMessage)
  return { status: true, message: { alert_message: 'Request rejected successfully' } }
}

export async function rejectClaim(auth: AdminAuthResult, requestRowId: number) {
  if (!auth.status) return auth
  if (Number.isNaN(requestRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  const checkRequest: any = await ProfessionalsClaimedRequestM.findOne({ _id: requestRowId, claim_request_status: 1 })
  if (!checkRequest) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  const claimEmailId = checkRequest.claim_email_id
  const userRowId = Number.parseInt(checkRequest.user_row_id)
  const checkAccess = await checkUserSubadminAccess(buildSubadminAccessParams(auth, userRowId))
  if (!checkAccess.status) {
    return { status: false, message: { alert_message: checkAccess.message } }
  }

  const [, checkActiveUser] = await Promise.all([
    ProfessionalsClaimedRequestM.updateOne({ _id: requestRowId }, { $set: { claim_request_status: 3 } }),
    ProfessionalM.findOne({ _id: userRowId }),
  ])

  const passSubject = 'Your CoinPedia User Profile Claim Request Rejected! '
  const passMessage = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${checkActiveUser?.full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your request for a CoinPedia user account has been rejected by our admin.</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Please check all your entered details once again, and submit a request to claim the user profile.</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Do Not Reply To This Email.</p>
                        `
  await sendEmail(claimEmailId, passSubject, passMessage)
  return { status: true, message: { alert_message: 'Request rejected successfully' } }
}

export async function acceptClaim(auth: AdminAuthResult, claimRequestRowId: number) {
  if (!auth.status) return auth
  if (Number.isNaN(claimRequestRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  const checkPendingList: any = await ProfessionalsClaimedRequestM.findOne({ _id: claimRequestRowId, claim_request_status: 1 })
  if (!checkPendingList) {
    return { status: false, message: { alert_message: 'Sorry, Invalid request row Id.' } }
  }

  const userRowId = Number.parseInt(checkPendingList.user_row_id)
  const checkAccess = await checkUserSubadminAccess(buildSubadminAccessParams(auth, userRowId))
  if (!checkAccess.status) {
    return { status: false, message: { alert_message: checkAccess.message } }
  }

  const checkActiveUser: any = await ProfessionalM.findOne({ _id: userRowId, login_status: 1 })
  if (!checkActiveUser) {
    return { status: false, message: { alert_message: 'Sorry, This user disabled or invalid id.' } }
  }

  if (checkActiveUser.claim_status !== 1) {
    if (checkActiveUser.claim_status === 2) {
      return { status: false, message: { alert_message: 'Sorry, This user is already claimed by some other user.' } }
    }
    return { status: false, message: { alert_message: 'Sorry, This user is self created.' } }
  }

  const fullName = checkActiveUser.full_name
  const claimEmailId = checkPendingList.claim_email_id

  // CONFIRMED PERF FIX: legacy awaits these two independent updates (different collections)
  // sequentially — Promise.all'd here.
  await Promise.all([
    ProfessionalM.updateOne({ _id: userRowId }, { $set: { email_id: claimEmailId, claim_status: 2 } }),
    ProfessionalsClaimedRequestM.updateOne({ _id: claimRequestRowId }, { $set: { claim_request_status: 2 } }),
  ])

  const passSubject = ' Your CoinPedia User Profile Claim Request Approved!'
  const passMessage = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${fullName},</p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">We are pleased to inform you that your claim request for a CoinPedia user account has been approved. Your login email ID is <span style="color:#0029ff;">${claimEmailId}</span></p>
                                <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
                                <ul>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
                                    <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
                                </ul>
                                <p style="color:#000;font-weight: 400;font-size:17px;">Thank you for supporting our mission of bringing Blockchain professionals worldwide together!</p>
                                `
  await sendEmail(claimEmailId, passSubject, passMessage)
  return { status: true, message: { alert_message: 'This user account has been claimed successfully.' } }
}

// FLAGGED, NOT FIXED (real, confirmed bug): legacy returns `status: true` for the invalid-id
// branch here — every other "invalid id" response in this file (and everywhere else in the
// codebase) returns `status: false`. Ported as-is; flipping it is a real response-shape change.
export async function deleteClaim(auth: AdminAuthResult, requestRowId: number) {
  if (!auth.status) return auth
  if (Number.isNaN(requestRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  const checkRequest = await ProfessionalsClaimedRequestM.findOne({ _id: requestRowId })
  if (!checkRequest) {
    return { status: true, message: { alert_message: 'Sorry, Invalid Request Row Id' } }
  }

  await ProfessionalsClaimedRequestM.deleteOne({ _id: requestRowId })
  return { status: true, message: { alert_message: 'Request deleted successfully' } }
}

// FLAGGED, NOT FIXED (real, confirmed gap): no not-found guard on an invalid/non-existent
// request_row_id — `queryRun[0]` is `undefined`, so the response serializes to just
// `{"status":true}` (JSON.stringify drops an `undefined` value), silently omitting `message`
// instead of returning a proper not-found response. Ported as-is.
export async function viewClaim(auth: AdminAuthResult, requestRowId: number) {
  if (!auth.status) return auth
  if (Number.isNaN(requestRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  const queryRun = await ProfessionalsClaimedRequestM.aggregate(buildViewClaimPipeline(requestRowId))
  return { status: true, message: queryRun[0] }
}
