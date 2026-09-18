// modules/company_claim_requests/company_claim_requests.service.ts
const jwt = require('jsonwebtoken')
const randomstring = require('randomstring')
const { sendEmail } = require('../../../config/email')
const { updateThreadNotification, updateNotification } = require('../../../utils/helpers/notification_helper')
const { getPresentDateTime, checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
import {
  buildClaimRequestsMatchQuery,
  extractClaimRequestsPaginatedResult,
  findExistingPendingClaimRequest,
  createClaimRequest,
  updateClaimRequestStatus,
  aggregateClaimRequestApprovalDetail,
  aggregateClaimRequestRejectionDetail,
  aggregateClaimRequestsList,
  findClaimantBasicInfo,
  findProfessionalById,
  findApprovedCompanyByEmail,
  findApprovedCompanyByDomain,
  findApprovedActiveCompanyById,
  findCompanyByUserRowId,
  findCompanyById,
  findCompanyByIdAndClaimStatus,
  updateCompanyOwnership,
  findCompanyCreatedByAdmin,
  findCompanyCreatedByAdminByVerifyCode,
  updateCompanyCreatedByAdminVerifyCode,
  updateCompanyCreatedByAdminClaimStatus,
} from './company_claim_requests.queries'
import { AdminActor, UserActor, AdminTokenPayload } from './company_claim_requests.types'

const JWT_CLAIM_SECRET_KEY = process.env.JWT_CLAIM_SECRET_KEY

// claim_type: 1 same email id, 2 same domain
async function addNewClaimRequest(userRowId: number | string, companyRowId: number, claimType: number) {
  const existing = await findExistingPendingClaimRequest(userRowId, companyRowId)
  if (existing) {
    return false
  }

  return createClaimRequest({
    user_row_id: userRowId,
    company_row_id: companyRowId,
    claim_type: claimType,
    claim_status: 1,
    date_n_time: getPresentDateTime(),
  })
}

async function sendClaimRequestEmail(toEmail: string, companyName: string, companyId: string, claimantEmail: string, claimantFullName: string, dateNTime: Date) {
  const subject = 'Important Update on your Company Profile Claimed!'
  const message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${companyName} Team,</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We hope this email finds you well. We are writing to inform you that your company <b style="text-transform: capitalize;">${companyName}</b> was claimed by a user profile <b style="text-transform: capitalize;">${claimantFullName}</b> on <b>${dateNTime}</b>.The claim was made from the email id <span style="color:#0029ff">${claimantEmail}</span></p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Company profile link:<a href=${'https://app.coinpedia.org/company/' + companyId} target="_blank" rel="nofollow" style="color:#0029ff">${'https://app.coinpedia.org/company/' + companyId}</a> </p>
    <p style="color:#000;font-weight: 400;font-size:17px;">If you believe that this claim made was not appropriate, then you can reach out to us for further assistance.</p>
    `
  await sendEmail(toEmail, subject, message)
}

export interface SaveClaimRequestDetailsParams {
  actor: UserActor
  companyRowIdRaw: string
}

/** Ports front_page.js's GET /save_claim_request_details/:company_row_id (lines 815-894). */
export async function saveClaimRequestDetails({ actor, companyRowIdRaw }: SaveClaimRequestDetailsParams) {
  if (!actor.status) {
    return actor
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }
  }

  const user_row_id = actor.message
  const user_query = (await findClaimantBasicInfo(user_row_id))!
  const email_id = user_query.email_id!

  const company_query = await findApprovedCompanyByEmail(email_id, company_row_id)
  if (company_query) {
    if (company_query.user_row_id) {
      return { status: false, message: { alert_message: 'Sorry, This company owned some other registered coinpedia user' } }
    }

    const claim_details = await addNewClaimRequest(user_row_id, company_query._id, 1)
    if (!claim_details) {
      return { status: false, message: { alert_message: 'Sorry, Your company claim request is already in queue, please wait admin will be process your request.' } }
    }

    await sendClaimRequestEmail(email_id, company_query.company_name!, company_query.company_id!, email_id, user_query.full_name!, claim_details.date_n_time!)
    await updateThreadNotification({ user_row_id: -1, notify_type: 2, notify_type_row_id: company_row_id, message_row_id: 25, action_row_id: claim_details._id })

    return { status: true, message: { alert_message: 'Your claim request will be processed within 24 hours and you will be notified via email. Please check your email for more updates. !' } }
  }

  const email_id_domain = email_id.split('@').slice(-1)[0]
  const company_same_domain_query = await findApprovedCompanyByDomain(email_id_domain, company_row_id)
  if (!company_same_domain_query) {
    return { status: false, message: { alert_message: 'Sorry, To claim this company, your registered email id must be same as company email id or else contains domain extension of this company website.' } }
  }

  const claim_details = await addNewClaimRequest(user_row_id, company_same_domain_query._id, 2)
  if (!claim_details) {
    return { status: false, message: { alert_message: 'Sorry, Your company claim request is already in queue, please wait admin will be process your request.' } }
  }

  await updateThreadNotification({ user_row_id: -1, notify_type: 2, notify_type_row_id: company_row_id, message_row_id: 25, action_row_id: claim_details._id })
  if (company_same_domain_query.company_email_id) {
    await sendClaimRequestEmail(company_same_domain_query.company_email_id, company_same_domain_query.company_name!, company_same_domain_query.company_id!, email_id, user_query.full_name!, claim_details.date_n_time!)
  }

  return { status: true, message: { alert_message: 'Your claim request will be processed within 24 hours and you will be notified via email. Please check your email for more updates. !' } }
}

export interface ClaimCompanyParams {
  actor: UserActor
  companyRowIdRaw: string
}

/** Ports front_page.js's POST /claim_company (lines 932-1020). */
export async function claimCompany({ actor, companyRowIdRaw }: ClaimCompanyParams) {
  const company_row_id = Number.parseInt(companyRowIdRaw)
  const checkApprovedCompany = await findApprovedActiveCompanyById(company_row_id)
  if (!checkApprovedCompany) {
    return { status: false, message: { company_row_id: 'Sorry, Invalid Company Row ID.' } }
  }

  if (!actor.status) {
    return actor
  }

  const user_row_id = actor.message
  const checkUserListedCompany = await findCompanyByUserRowId(user_row_id)
  if (checkUserListedCompany) {
    return { status: false, message: { alert_message: 'You already have a company' } }
  }

  const checkCompanyAdCreated = await findCompanyCreatedByAdmin(company_row_id)
  if (!checkCompanyAdCreated) {
    return { status: false, message: { alert_message: 'Sorry, This company is self created.' } }
  }

  if (Number.parseInt(String(checkCompanyAdCreated.claim_status)) !== 1) {
    return { status: false, message: { alert_message: 'Company Already Claimed' } }
  }

  const rndm_string = randomstring.generate(40)
  const jwtObj = { user_row_id, company_row_id, claim_verify_code: rndm_string, issued_at: new Date().getTime() }
  const claim_token = jwt.sign(jwtObj, JWT_CLAIM_SECRET_KEY)

  await updateCompanyCreatedByAdminVerifyCode(company_row_id, rndm_string)

  const company_name = checkApprovedCompany.company_name
  const pass_email_id = checkApprovedCompany.company_email_id
  const pass_subject = 'Welcome to CoinPedia Pro Account!'
  const pass_message = `<div style="background:#fff;padding:40px 50px 30px;font-size:14px;line-height:1.4; border-radius: 5px;">
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${company_name},</p>
        <div style="color:#000">
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>WELCOME TO COINPEDIA PRO ACCOUNT</b></p>
            <p style="color:#000;font-weight: 400;font-size:17px;">Having a Coinpedia account makes you a complete Fintech and Blockchain Professional. Get Price Insights, Read News of your Interest, Join the Crypto Professionals Network, Get the best of Crypto services and enjoy rewards.</p>
            <br>
            <a href=${'https://app.coinpedia.org/company/claim-account/' + claim_token} target="_blank" rel="nofollow" style="color:#0029ff;font-weight: 400;font-size:17px;">Verify</a>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Login Id :</b> ${pass_email_id}</p>
        </div>
    </div>`

  await sendEmail(pass_email_id, pass_subject, pass_message)

  return { status: true, message: { alert_message: 'Verify Link is sent to company e-mail id' } }
}

export interface VerifyClaimParams {
  actor: UserActor
  claimTokenRaw: string
}

/**
 * Ports front_page.js's GET /verify_claim/:claim_token (lines 1022-1076).
 *
 * SECURITY FIX (confirmed with the user 2026-08-03): the real source decoded user_row_id from
 * the JWT itself and granted ownership to THAT id, only ever using checkUserToken/actor as an
 * "is someone logged in" gate — never checking the caller IS the user the claim link was issued
 * to. Anyone logged into any account who obtains a still-valid claim link (forwarded email,
 * shared link, leaked token) could complete someone else's claim. Fixed by cross-checking
 * actor.message (the real logged-in caller's own user_row_id) against the token's user_row_id
 * before doing anything else — a mismatch now hard-rejects.
 */
export async function verifyClaim({ actor, claimTokenRaw }: VerifyClaimParams) {
  if (!actor.status) {
    return actor
  }

  const claim_token = jwt.verify(claimTokenRaw, JWT_CLAIM_SECRET_KEY)
  const token_user_row_id = Number.parseInt(claim_token.user_row_id)
  const caller_user_row_id = Number.parseInt(String(actor.message))

  if (caller_user_row_id !== token_user_row_id) {
    return { status: false, message: { alert_message: 'Sorry! This claim link was not issued to your account.' } }
  }

  const company_row_id = Number.parseInt(claim_token.company_row_id)

  const checkUser = await findProfessionalById(token_user_row_id)
  if (!checkUser) {
    return { status: false, message: { alert_message: 'Sorry! Invalid Claim Token' } }
  }

  const checkCompany = await findCompanyById(company_row_id)
  if (!checkCompany) {
    return { status: false, message: { alert_message: 'Sorry! Invalid Claim Token' } }
  }

  const saveData = await findCompanyCreatedByAdminByVerifyCode(company_row_id, claim_token.claim_verify_code)
  if (!saveData) {
    return { status: false, message: { alert_message: 'Sorry! Invalid Claim Token' } }
  }

  if (Number.parseInt(String(saveData.claim_status)) !== 1) {
    return { status: false, message: { alert_message: 'Sorry! Company Already Claimed' } }
  }

  await updateCompanyCreatedByAdminClaimStatus(company_row_id, 2)

  const updateFields = getUpdateTrackerFields(actor)
  await updateCompanyOwnership(company_row_id, { user_row_id: token_user_row_id, ...updateFields })

  return { status: true, message: { alert_message: 'Company claimed successfully' } }
}

export interface GetClaimRequestsListParams {
  claimStatusRaw: string
  skipRaw: string
  limitRaw: string
  search?: string
}

/** Ports claim_requests.js's GET /list/:claim_status/:skip/:limit (lines 15-215), $facet-converted. */
export async function getClaimRequestsList({ claimStatusRaw, skipRaw, limitRaw, search }: GetClaimRequestsListParams) {
  const claimStatus = !Number.isNaN(Number.parseInt(claimStatusRaw)) ? Number.parseInt(claimStatusRaw) : 0
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  const matchQuery = buildClaimRequestsMatchQuery({ claimStatus, search })
  const aggregateOutput = await aggregateClaimRequestsList({ matchQuery, claimStatus, skip, limit })
  const { data, count } = extractClaimRequestsPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface ApproveClaimRequestParams {
  admin: AdminActor
  requestRowIdRaw: string
}

/** Ports claim_requests.js's GET /approve_request/:request_row_id (lines 217-374). */
export async function approveClaimRequest({ admin, requestRowIdRaw }: ApproveClaimRequestParams) {
  const request_row_id = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(request_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } }
  }

  const queryRun = await aggregateClaimRequestApprovalDetail(request_row_id)

  const row = queryRun[0]
  if (!row) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } }
  }

  const company_row_id = row.company_row_id!
  const user_row_id = row.user_row_id!

  // Ports the real source's behavior exactly: admin.message is only ever the decoded token
  // payload at this call site in practice (the route handler already returned early on
  // !checkToken.status before calling this), so this asserts the shape rather than re-checking
  // admin.status here (which the real source never did either).
  const adminMessage = admin.message as AdminTokenPayload

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(String(adminMessage.admin_row_id)),
    admin_manager_type: adminMessage.admin_manager_type,
    sub_admin_type: Number.parseInt(String(adminMessage.sub_admin_type)),
    company_row_id,
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const check_user_created_query = await findCompanyByUserRowId(user_row_id)
  if (check_user_created_query) {
    return { status: false, message: { alert_message: 'Sorry, This user already owned by company ' + check_user_created_query.company_name } }
  }

  const check_company_query = await findCompanyByIdAndClaimStatus(company_row_id, 1)
  if (check_company_query && check_company_query.user_row_id) {
    return { status: false, message: { alert_message: 'Sorry, This company has already owned by user ' } }
  }

  const updateFields = getUpdateTrackerFields(admin)
  await updateCompanyOwnership(company_row_id, { user_row_id, claim_status: 2, ...updateFields })
  await updateCompanyCreatedByAdminClaimStatus(company_row_id, 2)
  await updateClaimRequestStatus(request_row_id, { claim_status: 2, claim_action_date_n_time: getPresentDateTime() })

  if (user_row_id) {
    await updateNotification({ user_row_id, notify_type: 2, notify_type_row_id: company_row_id, message_row_id: 13, action_row_id: request_row_id })
  }

  const pass_subject = 'Your Claim Request for Company ' + row.company_name + ' was Approved by the Admin. '
  const pass_message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${row.full_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Good News.! Your claim request for the Company <b style="text-transform: capitalize;">${row.company_name}</b> was accepted and approved successfully by the admin. </p>
    <p style="color:#000;font-weight: 400;font-size:17px;">You are now eligible to access all the features of the Coinpedia Company Profile Account.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login here</a> and complete your company profile.</p>
    `
  await sendEmail(row.email_id, pass_subject, pass_message)

  return { status: true, message: { alert_message: 'This user, company claim request approved successfully.' } }
}

export interface RejectClaimRequestParams {
  admin: AdminActor
  requestRowIdRaw: string
  rejectedReason: string
}

/** Ports claim_requests.js's POST /reject_request/:request_row_id (lines 376-495). */
export async function rejectClaimRequest({ admin, requestRowIdRaw, rejectedReason }: RejectClaimRequestParams) {
  const queryRun = await aggregateClaimRequestRejectionDetail(Number.parseInt(requestRowIdRaw))

  const row = queryRun[0]
  if (!row) {
    return { status: false, message: { alert_message: 'Sorry! Invalid Request Row Id' } }
  }

  // See approveClaimRequest's identical assertion above for why this doesn't re-check admin.status.
  const adminMessage = admin.message as AdminTokenPayload

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(String(adminMessage.admin_row_id)),
    admin_manager_type: adminMessage.admin_manager_type,
    sub_admin_type: Number.parseInt(String(adminMessage.sub_admin_type)),
    company_row_id: row.company_row_id,
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  await updateClaimRequestStatus(requestRowIdRaw, { claim_status: 3, claim_rejected_reason: rejectedReason, claim_action_date_n_time: getPresentDateTime() })

  if (row.user_row_id) {
    await updateNotification({ user_row_id: row.user_row_id, notify_type: 2, notify_type_row_id: row.company_row_id, message_row_id: 14, action_row_id: Number.parseInt(requestRowIdRaw) })
  }

  const pass_subject = 'Your claim Request for the company ' + row.company_name + ' was declined'
  const pass_message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${row.full_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We are sorry to inform you that your claim request for the company <b style="text-transform: capitalize;">${row.company_name} </b> was rejected by our admin due to the reason mentioned below :</p>
    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reason: </b>${rejectedReason}</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">No worries, we suggest you submit a new claim request from the email id that matches the company’s domain name. </p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Submit a new claim request <a href="https://app.coinpedia.org/login/" style="color:#0029ff;">here.</a></p>
    `
  await sendEmail(row.email_id, pass_subject, pass_message)

  return { status: true, message: { alert_message: 'This user, company claim request rejected successfully.' } }
}
