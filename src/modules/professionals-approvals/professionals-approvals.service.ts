// modules/professionals-approvals/professionals-approvals.service.ts
// Ports controllers/admin_panel/app/user_approvals.js's 3 routes (~121-670). Same behavior, same
// response shapes. Owns no colocated model — filters the core `professionalsM` by
// approval_status, per the plan's model-to-module mapping.
import ProfessionalM from '../../../models/app/professionalsM'
import { buildApprovalsFilters, buildApprovalsListPipeline, buildApprovalsCountPipeline } from './professionals-approvals.queries'
import type { AdminAuthResult, ListParams } from './professionals-approvals.types'
import { recordProfessionalStatusChange } from '../professionals/professionals.audit'

const { getPresentDateTime, checkUserSubadminAccess } = require('../../../utils/helpers/helper')
const { getUpdateTrackerFields } = require('../../../utils/helpers/app_helper')
const { sendEmail } = require('../../../config/email')
const { updateNotification } = require('../../../utils/helpers/notification_helper')

const VALID_APPROVAL_STATUSES = [0, 1, 2]

export async function getApprovalsList(params: ListParams) {
  if (!VALID_APPROVAL_STATUSES.includes(params.approvalStatus)) {
    return { status: false, message: { alert_message: 'Please enter according to  0:pending, 1:approved, 2:rejected' } }
  }

  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 100

  const { matchAnd, designationLookingForConditions } = buildApprovalsFilters(params)

  // CONFIRMED PERF FIX, already applied by a prior engagement: list and count run concurrently
  // instead of as two sequential awaits. Preserved as-is while porting.
  const [list, countResult] = await Promise.all([
    ProfessionalM.aggregate(buildApprovalsListPipeline(matchAnd, designationLookingForConditions)).skip(skip).limit(limit),
    ProfessionalM.aggregate(buildApprovalsCountPipeline(matchAnd, designationLookingForConditions)),
  ])
  const count = countResult[0]?.count || 0

  return { status: true, message: list, count }
}

export async function approveRequest(auth: AdminAuthResult, requestRowId: number) {
  if (!auth.status) return auth
  if (Number.isNaN(requestRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  const userQuery: any = await ProfessionalM.findOne({ _id: requestRowId }, { _id: 1, full_name: 1, user_name: 1, email_id: 1, approval_status: 1 })
  if (!userQuery) {
    return { status: false, message: { alert_message: 'Sorry, invalid request row id' } }
  }

  const checkAccess = await checkUserSubadminAccess({
    admin_row_id: Number.parseInt(auth.message.admin_row_id as string),
    admin_manager_type: auth.message.admin_manager_type,
    sub_admin_type: Number.parseInt(auth.message.sub_admin_type as string),
    user_row_id: requestRowId,
  })
  if (!checkAccess.status) {
    return { status: false, message: { alert_message: checkAccess.message } }
  }

  if (userQuery.approval_status === 1) {
    return { status: false, message: { alert_message: 'Sorry, this user cannot be approved' } }
  }

  const updateFields = getUpdateTrackerFields(auth)
  await ProfessionalM.updateOne({ _id: requestRowId }, { $set: { approval_status: 1, ...updateFields, updated_date_n_time: new Date() } })
  // CONFIRMED GAP FIX (user-requested, 2026-09-20): self-register approve/reject was never
  // audited at all - Company's own equivalent (company_admin.approvals.service.ts) already
  // records this, this was the one asymmetric gap.
  await recordProfessionalStatusChange({
    documentId: requestRowId,
    action: 'approve',
    tracker: updateFields,
    adminRowId: auth.message.admin_row_id,
  })

  const passSubject = 'Your Coinpedia User Account is Approved'
  const passMessage = `
                            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${userQuery.full_name},</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">We are delighted to inform you that your user profile has been reviewed and approved by our admin.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">You are now able to access all the features of Coinpedia to manage your account, create and list your event, add wallet to track your portfolio, gain insights from the Crypto experts, learn from scratch the crypto industry, and stay updated with Coinpedia’s latest news on Fintech and Crypto.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;">Get started with your account by logging in.</p>
                            <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;">Login Here</a></p>
                            `
  await sendEmail(userQuery.email_id, passSubject, passMessage)
  await updateNotification({ user_row_id: requestRowId, notify_type: 1, notify_type_row_id: 0, message_row_id: 4, action_row_id: requestRowId })

  return { status: true, message: { alert_message: 'This User account has been approved successfully.' } }
}

export async function rejectRequest(auth: AdminAuthResult, requestRowId: number, reasonRejected: unknown, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth

  const errObj = { ...preValidationErrors }
  const checkAccess = await checkUserSubadminAccess({
    admin_row_id: Number.parseInt(auth.message.admin_row_id as string),
    admin_manager_type: auth.message.admin_manager_type,
    sub_admin_type: Number.parseInt(auth.message.sub_admin_type as string),
    user_row_id: requestRowId,
  })
  if (!checkAccess.status) errObj['alert_message'] = checkAccess.message

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }
  if (Number.isNaN(requestRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }
  }

  // CONFIRMED PERF FIX: legacy runs these two independent finds against the same collection
  // sequentially, purely to produce two different error messages ("invalid id" vs "cannot be
  // rejected") — neither depends on the other's result, so Promise.all them.
  const [queryRun, checkApprovalQuery] = await Promise.all([
    ProfessionalM.findOne({ _id: requestRowId }),
    ProfessionalM.findOne({ _id: requestRowId, approval_status: 0 }),
  ])

  if (!queryRun) {
    return { status: false, message: { alert_message: 'Sorry, invalid request row id' } }
  }
  if (!checkApprovalQuery) {
    return { status: false, message: { alert_message: 'Sorry, this user cannot be rejected' } }
  }

  // Computed for the audit-log actor only (see recordProfessionalStatusChange below) - not spread
  // into updateArray. Company's own equivalent reject path (company_admin.approvals.service.ts)
  // does persist these onto the row itself; not replicated here since that's a real behavior/
  // schema change beyond this fix's scope (auditing), flagged rather than silently added.
  const updateFields = getUpdateTrackerFields(auth)
  const updateArray = { approval_status: 2, reason_rejected: reasonRejected, rejected_date_n_time: getPresentDateTime() }
  const passSubject = 'CoinPedia User Profile Request Denied '
  const passMessage = `
                                    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${checkApprovalQuery.full_name},</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your CoinPedia user account application has been denied.</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reject Reason : </b>${reasonRejected}</p>
                                    <p style="color:#000;font-weight: 400;font-size:17px;">Your interest is appreciated, and we invite you to <a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;">Register<a> to CoinPedia for more information!</p>
                                    `
  await sendEmail(checkApprovalQuery.email_id, passSubject, passMessage)
  await ProfessionalM.updateOne({ _id: requestRowId }, { $set: updateArray })
  await recordProfessionalStatusChange({
    documentId: requestRowId,
    action: 'reject',
    tracker: updateFields,
    adminRowId: auth.message.admin_row_id,
    reason: typeof reasonRejected === 'string' ? reasonRejected : null,
  })
  await updateNotification({ user_row_id: requestRowId, notify_type: 1, notify_type_row_id: 0, message_row_id: 5, action_row_id: requestRowId })

  return { status: true, message: { alert_message: 'user rejected successfully' } }
}
