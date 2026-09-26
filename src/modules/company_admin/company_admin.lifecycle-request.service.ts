// modules/company_admin/company_admin.lifecycle-request.service.ts
// Gates the direct admin-panel actions (Enable/Disable) on a company's own record behind the same
// pending -> approve -> publish flow every field edit already goes through (user-requested
// 2026-09-20, mirrors professionals.lifecycle-request.service.ts field-for-field). Reuses the SAME
// change_requestM collection/engine - no new table - via a lightweight "intended_action" control
// payload instead of a field diff. Company has no direct one-click "Delete" action on its main
// record today (confirmed earlier this session - deletion only happens via the Claim/Manual
// Retrieval request-approval flows, already excluded from this scope), so only Enable/Disable are
// gated here.
const { checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
const companyM = require('../../../models/app/company/companyM')
const professionalsM = require('../../../models/app/professionalsM')
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
import { insertChangeRequest, findPendingRequest } from '../../modules/change-request/change-request.queries'
import { CHANGE_REQUEST_ACTION } from '../../modules/change-request/change-request.types'
import { SECTION_COMPANY_STATUS } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_COMPANY } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { insertChangeLog } from '../../common/status-audit/status-audit.queries'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import logger from '../../../config/logger'

// Callers pass whatever `checkAdminLoginToken` shape their own module declares - kept permissive
// here (same reasoning as professionals.lifecycle-request.service.ts's own AdminAuthResult).
export type AdminAuthResult =
  | { status: true; message: { admin_row_id?: number | string; admin_manager_type?: number; sub_admin_type?: number | string } }
  | { status: false; message: unknown }

const STATUS_FIELD_LABEL = 'Status'
const ALREADY_PENDING_MESSAGE = 'A status change for this company is already pending review.'
const SUBMITTED_MESSAGE = 'Submitted for approval'

function actorFrom(admin: AdminAuthResult & { status: true }): ActorRef {
  const tracker = getUpdateTrackerFields(admin)
  return toActorRefWithId(tracker, Number(admin.message.admin_row_id ?? 0))
}

function subadminAccessParams(admin: AdminAuthResult & { status: true }, companyRowId: number) {
  return {
    admin_row_id: Number(admin.message.admin_row_id),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number(admin.message.sub_admin_type),
    company_row_id: companyRowId,
  }
}

interface SubmitLifecycleActionParams {
  admin: AdminAuthResult & { status: true }
  companyRowId: number
  intendedAction: 'enable' | 'disable' | 'approve' | 'reject'
  // Named for its original Enable/Disable use case; a reject's reason is threaded through this
  // same param/payload key ('disable_reason') rather than adding a second one, since
  // applyCompanyStatusWrite/applyCompanyStatusSideEffects only ever need "the one reason string
  // for this action" regardless of which action it is.
  reasonForDisable?: string
  oldLabel: string
  newLabel: string
}

async function submitLifecycleAction({ admin, companyRowId, intendedAction, reasonForDisable, oldLabel, newLabel }: SubmitLifecycleActionParams) {
  const existing = await findPendingRequest({ module: AUDIT_MODULE_COMPANY, rootDocumentId: companyRowId, section: SECTION_COMPANY_STATUS })
  if (existing) {
    return { status: false, message: { alert_message: ALREADY_PENDING_MESSAGE } }
  }

  const actor = actorFrom(admin)
  const payload: Record<string, unknown> = { intended_action: intendedAction }
  if (reasonForDisable) payload['disable_reason'] = reasonForDisable

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
    module: AUDIT_MODULE_COMPANY,
    target_collection: 'cln_company_lists',
    target_row_id: null,
    root_document_id: companyRowId,
    section: SECTION_COMPANY_STATUS,
    scope: 'document',
    action: CHANGE_REQUEST_ACTION.UPDATE,
    payload,
    changes,
    requested_by: actor,
  })

  try {
    await insertChangeLog({
      module: AUDIT_MODULE_COMPANY,
      target_collection: 'cln_company_lists',
      target_row_id: companyRowId,
      root_document_id: companyRowId,
      section: SECTION_COMPANY_STATUS,
      action: 'submit',
      actor,
      changes,
      reason: reasonForDisable ?? null,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, companyRowId, changeRequestId }, 'company_admin.lifecycle-request: submit log write failed')
  }

  return { status: true, message: { alert_message: SUBMITTED_MESSAGE }, changeRequestId }
}

export async function submitEnableCompanyRequest(admin: AdminAuthResult, companyRowIdRaw: string) {
  if (!admin.status) return admin
  const companyRowId = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(companyRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }

  const queryRunCheck = await companyM.findOne({ _id: companyRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Oops! Invalid Company Row Id' } }

  const checkAccess = await checkCompanySubadminAccess(subadminAccessParams(admin, companyRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  if (queryRunCheck.active_status !== 0) {
    return { status: false, message: { alert_message: 'Sorry! This Company is already enabled' } }
  }

  if (queryRunCheck.user_row_id > 0) {
    const checkUserStatus = await professionalsM.findOne({ _id: queryRunCheck.user_row_id, login_status: 1 })
    if (!checkUserStatus) {
      return { status: false, message: { check_user_status: checkUserStatus, alert_message: 'Sorry! You need to enable the user before enabling the company' } }
    }
  }

  return submitLifecycleAction({ admin, companyRowId, intendedAction: 'enable', oldLabel: 'Disabled', newLabel: 'Enabled' })
}

export async function submitDisableCompanyRequest(admin: AdminAuthResult, companyRowIdRaw: string, disableReason: string) {
  if (!admin.status) return admin
  const companyRowId = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(companyRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }

  const checkAccess = await checkCompanySubadminAccess(subadminAccessParams(admin, companyRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  const queryRunCheck = await companyM.findOne({ _id: companyRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Oops! Invalid Company Row Id' } }

  if (queryRunCheck.active_status !== 1) {
    return { status: false, message: { alert_message: 'Sorry! This Company is already Disabled' } }
  }

  return submitLifecycleAction({ admin, companyRowId, intendedAction: 'disable', reasonForDisable: disableReason, oldLabel: 'Enabled', newLabel: 'Disabled' })
}

/**
 * Stages the first-time Approve decision on a brand-new pending company submission behind the
 * same pending -> approve -> publish flow as Enable/Disable above (user-requested 2026-09-26),
 * instead of applying it immediately the way approveCompanyRequest (company_admin.approvals.
 * service.ts, now removed) used to. `requestRowIdRaw` is the company row id, matching the
 * original route's own `:request_row_id` param naming.
 */
export async function submitApproveCompanyRequest(admin: AdminAuthResult, requestRowIdRaw: string) {
  if (!admin.status) return admin
  const companyRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(companyRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } }

  const queryRunCheck = await companyM.findOne({ _id: companyRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } }

  const checkAccess = await checkCompanySubadminAccess(subadminAccessParams(admin, companyRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  if (queryRunCheck.approval_status !== 0) {
    return { status: false, message: { alert_message: 'Sorry, This Company cannot be approved' } }
  }

  return submitLifecycleAction({ admin, companyRowId, intendedAction: 'approve', oldLabel: 'Pending', newLabel: 'Approved' })
}

/**
 * Stages the first-time Reject decision on a brand-new pending company submission behind the
 * same pending -> approve -> publish flow as Enable/Disable above (user-requested 2026-09-26),
 * instead of applying it immediately the way rejectCompanyRequest (company_admin.approvals.
 * service.ts, now removed) used to.
 */
export async function submitRejectCompanyRequest(admin: AdminAuthResult, requestRowIdRaw: string, reasonRejected: string) {
  if (!admin.status) return admin
  const companyRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(companyRowId)) return { status: false, message: { alert_message: 'Oops! Invalid Company Row Id' } }

  const queryRunCheck = await companyM.findOne({ _id: companyRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Sorry! Invalid Request Row Id' } }

  const checkAccess = await checkCompanySubadminAccess(subadminAccessParams(admin, companyRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  if (queryRunCheck.approval_status !== 0) {
    return { status: false, message: { alert_message: 'Sorry! This Company cannot be rejected' } }
  }

  return submitLifecycleAction({ admin, companyRowId, intendedAction: 'reject', reasonForDisable: reasonRejected, oldLabel: 'Pending', newLabel: 'Rejected' })
}
