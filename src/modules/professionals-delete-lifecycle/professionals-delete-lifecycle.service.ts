// modules/professionals-delete-lifecycle/professionals-delete-lifecycle.service.ts
// Ports controllers/admin_panel/app/user.js's 5 delete/recover-lifecycle routes (~3537-3927).
// Same behavior, same response shapes — confirmed perf fixes noted inline; one confirmed
// pre-existing bug flagged, not silently fixed.
import mongoose from 'mongoose'
import logger from '../../../config/logger'
import ProfessionalM from '../../../models/app/professionalsM'
import {
  buildDeleteRequestsMatchQuery, buildDeleteRequestsListPipeline,
  buildDeletedListMatchQuery, buildDeletedListPipeline,
  buildRecoveredListPipeline, buildRecoveredCountPipeline,
} from './professionals-delete-lifecycle.queries'
import type { AdminAuthResult } from './professionals-delete-lifecycle.types'

const ProfessionalsDeleteVerificationsM = require('../../../models/app/professionals_delete_verificationsM')
const ProfessionalsDeleteActionsM = require('../../../models/app/professionals_delete_actionsM')
const CompanyM = require('../../../models/app/company/companyM')
const EventM = require('../../../models/app/events/eventM')
const { getPresentDateTime, checkUserSubadminAccess } = require('../../../utils/helpers/helper')
const { deleteUserDetais } = require('../../../utils/helpers/app_helper')
const { sendEmail } = require('../../../config/email')

function parsePaging(skipRaw: string, limitRaw: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { skip, limit }
}

export async function getDeleteRequestsList(skipRaw: string, limitRaw: string, search?: string) {
  const { skip, limit } = parsePaging(skipRaw, limitRaw)
  const matchQuery = buildDeleteRequestsMatchQuery(search)
  // CONFIRMED PERF FIX: legacy runs the list aggregate then countDocuments sequentially —
  // independent of each other, Promise.all'd here.
  const [list, count] = await Promise.all([
    ProfessionalM.aggregate(buildDeleteRequestsListPipeline(matchQuery)).skip(skip).limit(limit),
    ProfessionalM.countDocuments({ $and: matchQuery }),
  ])
  return { status: true, message: list, count }
}

function buildSubadminAccessParams(auth: AdminAuthResult & { status: true }, userRowId: number) {
  return {
    admin_row_id: Number.parseInt(auth.message.admin_row_id as string),
    admin_manager_type: auth.message.admin_manager_type,
    sub_admin_type: Number.parseInt(auth.message.sub_admin_type as string),
    user_row_id: userRowId,
  }
}

export async function recoverAccount(auth: AdminAuthResult, userRowId: number, actionReasonRaw: unknown) {
  if (!auth.status) return auth
  if (Number.isNaN(userRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const checkAccess = await checkUserSubadminAccess(buildSubadminAccessParams(auth as any, userRowId))
  if (!checkAccess.status) {
    return { status: false, message: { alert_message: checkAccess.message } }
  }

  const actionReason = actionReasonRaw ? String(actionReasonRaw) : ''

  const checkQuery: any = await ProfessionalM.findOne({ _id: userRowId, login_status: 2 })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'This User account is active' } }
  }

  // ATOMICITY FIX (confirmed live bug, 2026-09-15): these writes used to run as separate,
  // unguarded statements. A failure partway through — reproduced live via a stale
  // professionals_delete_actions auto-increment counter throwing E11000 on the final insert —
  // left login_status flipped to active (from the first write) with no audit-log row ever
  // written, silently reactivating the account while the API still reported failure to the
  // admin. Wrapped in a session transaction (same `startSession`/`withTransaction` pattern as
  // change-request.apply.ts) so a failure at any step rolls back everything already written in
  // this call, instead of leaving a partially-applied recovery.
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await ProfessionalM.updateOne({ _id: userRowId }, { $set: { login_status: 1 } }, { session })
      await ProfessionalsDeleteVerificationsM.deleteOne({ user_row_id: userRowId }, { session })

      // CONFIRMED PERF FIX: legacy runs these two independent existence checks (and their
      // conditional reactivation writes) sequentially — Promise.all'd here, same class of fix as
      // professionals-account-settings.service.ts's verifyEmailAndDeleteAccount.
      const [checkCompany, checkEvents] = await Promise.all([
        CompanyM.findOne({ user_row_id: userRowId }, null, { session }),
        EventM.findOne({ user_row_id: userRowId }, null, { session }),
      ])
      await Promise.all([
        checkCompany ? CompanyM.updateOne({ user_row_id: userRowId }, { $set: { active_status: 1 } }, { session }) : null,
        checkEvents ? EventM.updateMany({ user_row_id: userRowId }, { $set: { active_status: 1 } }, { session }) : null,
      ])

      await ProfessionalsDeleteActionsM({ user_row_id: userRowId, action_type: 1, action_reason: actionReason, date_n_time: getPresentDateTime() }).save({ session })
    })
  } catch (err) {
    logger.error({ err, userRowId }, 'Recover account: transaction rolled back.')
    return { status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } }
  } finally {
    await session.endSession()
  }

  const passSubject = 'Your CoinPedia Account Recovered Successfully.'
  const passMessage = `
                        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${checkQuery.full_name},</p>
                        <p style="color:#000;font-weight: 500;font-size:17px;">Welcome back to your CoinPedia Account</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Your Coinpedia account has been recovered and all the features are now active. You can now continue using your account. </p>
                        <p ><a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;font-size:17px;">Login Here</a></p>
                        `
  await sendEmail(checkQuery.email_id, passSubject, passMessage)
  return { status: true, message: { alert_message: 'This user account has been recovered successfully.' } }
}

// FLAGGED, NOT FIXED (real, confirmed debug leftover): legacy's success response includes an
// `asd` key leaking the entire `delete_user` helper result into the client response — the exact
// same typo'd debug-key pattern found in professionals-account-settings.service.ts's
// verifyEmailAndDeleteAccount catch block. Ported as-is: removing it is a real response-shape
// change needing sign-off first.
export async function deleteUser(auth: AdminAuthResult, userRowId: number, token: unknown) {
  if (!auth.status) return auth
  if (Number.isNaN(userRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const checkUser = await ProfessionalM.findOne({ _id: userRowId })
  if (!checkUser) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const checkAccess = await checkUserSubadminAccess(buildSubadminAccessParams(auth as any, userRowId))
  if (!checkAccess.status) {
    return { status: false, message: { alert_message: checkAccess.message } }
  }

  const deleteUserResult = await deleteUserDetais({ user_row_id: userRowId, token })
  if (!deleteUserResult.status) {
    return { status: false, message: { alert_message: deleteUserResult.message } }
  }
  return { status: true, message: { alert_message: 'This user details deleted successfully.', asd: deleteUserResult } }
}

export async function getDeletedList(skipRaw: string, limitRaw: string, search?: string) {
  const { skip, limit } = parsePaging(skipRaw, limitRaw)
  const matchQuery = buildDeletedListMatchQuery(search)
  const [list, count] = await Promise.all([
    ProfessionalsDeleteActionsM.aggregate(buildDeletedListPipeline(matchQuery)).skip(skip).limit(limit),
    ProfessionalsDeleteActionsM.countDocuments(matchQuery),
  ])
  return { status: true, message: list, count }
}

export async function getRecoveredList(skipRaw: string, limitRaw: string, search?: string) {
  const { skip, limit } = parsePaging(skipRaw, limitRaw)
  const [list, countResult] = await Promise.all([
    ProfessionalsDeleteActionsM.aggregate(buildRecoveredListPipeline(search)).skip(skip).limit(limit),
    ProfessionalsDeleteActionsM.aggregate(buildRecoveredCountPipeline(search)),
  ])
  return { status: true, message: list, count: countResult[0]?.count || 0 }
}
