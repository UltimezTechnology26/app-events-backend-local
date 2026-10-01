// modules/professionals/professionals.lifecycle-request.service.ts
// Gates the direct admin-panel actions (Enable/Disable/Delete) on a professional's own record
// behind the same pending -> approve -> publish flow every field edit already goes through
// (user-requested 2026-09-20: "the same functionality of approval must be applied to enable,
// disable... or any other status changing of companies or professionals"). Reuses the SAME
// change_requestM collection/engine as every field-edit change request - no new table - via a
// lightweight "intended_action" control payload instead of a field diff, since there is no
// per-field state to diff for a lifecycle action (see change-request.registry.ts's
// SECTION_PROFESSIONAL_STATUS doc comment for the publish-side writer).
//
// Explicitly scoped to ONLY these three direct, one-click admin actions on the main record - the
// separate, pre-existing approval queues (Self-Register Approvals, Manual Retrievals, Claim
// Requests, Delete-lifecycle's own recover/deleted list) are untouched by this.
import { ProfessionalM } from './professionals.models'
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
import { insertChangeRequest, findPendingRequest } from '../../modules/change-request/change-request.queries'
import { CHANGE_REQUEST_ACTION } from '../../modules/change-request/change-request.types'
import { SECTION_PROFESSIONAL_STATUS } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { insertChangeLog } from '../../common/status-audit/status-audit.queries'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import logger from '../../../config/logger'

const { checkUserSubadminAccess } = require('../../../utils/helpers/helper')

// Callers pass whatever `checkAdminLoginToken` shape their own module declares
// (professionals.types.ts's AdminAuthResult and professionals-delete-lifecycle.types.ts's own
// AdminAuthResult both wrap the exact same middleware, just typed slightly differently) - kept
// permissive here rather than importing either specific type, so both call sites structurally fit.
export type AdminAuthResult =
  | { status: true; message: { admin_row_id?: number | string; admin_manager_type?: number; sub_admin_type?: number | string } }
  | { status: false; message: unknown }

const STATUS_FIELD_LABEL = 'Status'
const ALREADY_PENDING_MESSAGE = 'A status change for this professional is already pending review.'
const SUBMITTED_MESSAGE = 'Submitted for approval'

function actorFrom(admin: AdminAuthResult & { status: true }): ActorRef {
  const tracker = getUpdateTrackerFields(admin)
  return toActorRefWithId(tracker, Number(admin.message.admin_row_id ?? 0))
}

function subadminAccessParams(admin: AdminAuthResult & { status: true }, userRowId: number) {
  return {
    admin_row_id: Number(admin.message.admin_row_id),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number(admin.message.sub_admin_type),
    user_row_id: userRowId,
  }
}

interface SubmitLifecycleActionParams {
  admin: AdminAuthResult & { status: true }
  userRowId: number
  intendedAction: 'enable' | 'disable' | 'delete' | 'approve' | 'reject'
  reasonForDisable?: string
  oldLabel: string
  newLabel: string
}

async function submitLifecycleAction({ admin, userRowId, intendedAction, reasonForDisable, oldLabel, newLabel }: SubmitLifecycleActionParams) {
  const existing = await findPendingRequest({ module: AUDIT_MODULE_PROFESSIONALS, rootDocumentId: userRowId, section: SECTION_PROFESSIONAL_STATUS })
  if (existing) {
    return { status: false, message: { alert_message: ALREADY_PENDING_MESSAGE } }
  }

  const actor = actorFrom(admin)
  const payload: Record<string, unknown> = { intended_action: intendedAction }
  if (reasonForDisable) payload['reason_for_disable'] = reasonForDisable

  const changes = [{
    field: 'status',
    field_label: STATUS_FIELD_LABEL,
    old_value: oldLabel,
    old_label: oldLabel,
    new_value: newLabel,
    new_label: newLabel,
    changed_by: actor,
  }]

  const changeRequestId = await insertChangeRequest({
    module: AUDIT_MODULE_PROFESSIONALS,
    target_collection: 'cln_professionals',
    target_row_id: null,
    root_document_id: userRowId,
    section: SECTION_PROFESSIONAL_STATUS,
    scope: 'document',
    action: CHANGE_REQUEST_ACTION.UPDATE,
    payload,
    changes,
    requested_by: actor,
  })

  try {
    await insertChangeLog({
      module: AUDIT_MODULE_PROFESSIONALS,
      target_collection: 'cln_professionals',
      target_row_id: userRowId,
      root_document_id: userRowId,
      section: SECTION_PROFESSIONAL_STATUS,
      action: 'submit',
      actor,
      changes,
      reason: reasonForDisable ?? null,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, userRowId, changeRequestId }, 'professionals.lifecycle-request: submit log write failed')
  }

  return { status: true, message: { alert_message: SUBMITTED_MESSAGE }, changeRequestId }
}

export async function submitEnableUserRequest(admin: AdminAuthResult, userRowIdRaw: string) {
  if (!admin.status) return admin
  const userRowId = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(userRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }

  const queryRunCheck = await ProfessionalM.findOne({ _id: userRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Invalid User Row Id' } }

  const checkAccess = await checkUserSubadminAccess(subadminAccessParams(admin, userRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message }, tokenStatus: true }

  if (queryRunCheck.login_status !== 0) {
    return { status: false, message: { alert_message: 'This User is already Enabled' } }
  }

  return submitLifecycleAction({ admin, userRowId, intendedAction: 'enable', oldLabel: 'Disabled', newLabel: 'Enabled' })
}

export async function submitDisableUserRequest(admin: AdminAuthResult, userRowIdRaw: string, reasonForDisable: string) {
  if (!admin.status) return admin
  const userRowId = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(userRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }

  const checkAccess = await checkUserSubadminAccess(subadminAccessParams(admin, userRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  const queryRunCheck = await ProfessionalM.findOne({ _id: userRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Oops! Invalid User Row Id' } }

  if (queryRunCheck.login_status !== 1) {
    return { status: false, message: { alert_message: 'Sorry! This User is already Disabled' } }
  }

  return submitLifecycleAction({ admin, userRowId, intendedAction: 'disable', reasonForDisable, oldLabel: 'Enabled', newLabel: 'Disabled' })
}

export async function submitApproveUserRequest(admin: AdminAuthResult, requestRowIdRaw: string) {
  if (!admin.status) return admin
  const userRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(userRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }

  const queryRunCheck = await ProfessionalM.findOne({ _id: userRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Sorry, invalid request row id' } }

  const checkAccess = await checkUserSubadminAccess(subadminAccessParams(admin, userRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  if (queryRunCheck.approval_status === 1) {
    return { status: false, message: { alert_message: 'Sorry, this user cannot be approved' } }
  }

  return submitLifecycleAction({ admin, userRowId, intendedAction: 'approve', oldLabel: 'Pending', newLabel: 'Approved' })
}

export async function submitRejectUserRequest(admin: AdminAuthResult, requestRowIdRaw: string, reasonRejected: string) {
  if (!admin.status) return admin
  const userRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(userRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }

  const checkAccess = await checkUserSubadminAccess(subadminAccessParams(admin, userRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  const checkApprovalQuery = await ProfessionalM.findOne({ _id: userRowId, approval_status: 0 })
  if (!checkApprovalQuery) return { status: false, message: { alert_message: 'Sorry, this user cannot be rejected' } }

  return submitLifecycleAction({ admin, userRowId, intendedAction: 'reject', reasonForDisable: reasonRejected, oldLabel: 'Pending', newLabel: 'Rejected' })
}

export async function submitDeleteUserRequest(admin: AdminAuthResult, userRowIdRaw: string) {
  if (!admin.status) return admin
  const userRowId = Number.parseInt(userRowIdRaw)
  if (Number.isNaN(userRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }

  const checkUser = await ProfessionalM.findOne({ _id: userRowId })
  if (!checkUser) return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }

  const checkAccess = await checkUserSubadminAccess(subadminAccessParams(admin, userRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  return submitLifecycleAction({ admin, userRowId, intendedAction: 'delete', oldLabel: 'Active', newLabel: 'Deleted' })
}
