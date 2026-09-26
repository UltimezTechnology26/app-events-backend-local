// modules/events/events.lifecycle-request.service.ts
// Gates the direct admin-panel actions (Approve/Reject/Enable/Disable) on an event's own record
// behind the same pending -> approve -> publish flow every field edit already goes through
// (user-requested 2026-09-26: "approving/rejecting/enabling/disabling a company must be sent to
// pending changes... check is this happening in professionals/events also" - confirmed
// Company/Professional's Enable/Disable already did this (2026-09-20), Approve/Reject did not,
// and Events had neither - this file + events.lifecycle-apply.ts close both gaps for Events).
// Mirrors company_admin.lifecycle-request.service.ts field-for-field. Reuses the SAME
// change_requestM collection/engine as every field-edit change request - no new table - via a
// lightweight "intended_action" control payload instead of a field diff (see
// change-request.registry.ts's SECTION_EVENT_STATUS doc comment for the publish-side writer).
//
// Explicitly scoped to these four direct, one-click admin actions on the main record - Delete is
// out of scope (matches the user's literal four actions, same exclusion Company already made).
const eventM = require('../../../models/app/events/eventM')
import { checkSubadminAccess } from '../../../utils/helpers/events_helper'
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
import { insertChangeRequest, findPendingRequest } from '../../modules/change-request/change-request.queries'
import { CHANGE_REQUEST_ACTION } from '../../modules/change-request/change-request.types'
import { SECTION_EVENT_STATUS } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_EVENTS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { insertChangeLog } from '../../common/status-audit/status-audit.queries'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import logger from '../../../config/logger'

// Callers pass whatever `checkAdminLoginToken` shape their own module declares - kept permissive
// here, same reasoning as company_admin.lifecycle-request.service.ts's own AdminAuthResult.
export type AdminAuthResult =
  | { status: true; message: { admin_row_id?: number | string; admin_manager_type?: number | string; sub_admin_type?: number | string } }
  | { status: false; message: unknown }

const STATUS_FIELD_LABEL = 'Status'
const ALREADY_PENDING_MESSAGE = 'A status change for this event is already pending review.'
const SUBMITTED_MESSAGE = 'Submitted for approval'

function actorFrom(admin: AdminAuthResult & { status: true }): ActorRef {
  const tracker = getUpdateTrackerFields(admin)
  return toActorRefWithId(tracker, Number(admin.message.admin_row_id ?? 0))
}

function subadminAccessParams(admin: AdminAuthResult & { status: true }, eventRowId: number) {
  return {
    admin_row_id: Number(admin.message.admin_row_id),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number(admin.message.sub_admin_type),
    event_row_id: eventRowId,
  }
}

interface SubmitLifecycleActionParams {
  admin: AdminAuthResult & { status: true }
  eventRowId: number
  intendedAction: 'enable' | 'disable' | 'approve' | 'reject'
  reason?: string
  oldLabel: string
  newLabel: string
}

async function submitLifecycleAction({ admin, eventRowId, intendedAction, reason, oldLabel, newLabel }: SubmitLifecycleActionParams) {
  const existing = await findPendingRequest({ module: AUDIT_MODULE_EVENTS, rootDocumentId: eventRowId, section: SECTION_EVENT_STATUS })
  if (existing) {
    return { status: false, message: { alert_message: ALREADY_PENDING_MESSAGE } }
  }

  const actor = actorFrom(admin)
  const payload: Record<string, unknown> = { intended_action: intendedAction }
  if (reason) payload['reason'] = reason

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
    module: AUDIT_MODULE_EVENTS,
    target_collection: 'cln_events',
    target_row_id: null,
    root_document_id: eventRowId,
    section: SECTION_EVENT_STATUS,
    scope: 'document',
    action: CHANGE_REQUEST_ACTION.UPDATE,
    payload,
    changes,
    requested_by: actor,
  })

  try {
    await insertChangeLog({
      module: AUDIT_MODULE_EVENTS,
      target_collection: 'cln_events',
      target_row_id: eventRowId,
      root_document_id: eventRowId,
      section: SECTION_EVENT_STATUS,
      action: 'submit',
      actor,
      changes,
      reason: reason ?? null,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, eventRowId, changeRequestId }, 'events.lifecycle-request: submit log write failed')
  }

  return { status: true, message: { alert_message: SUBMITTED_MESSAGE }, changeRequestId }
}

export async function submitEnableEventRequest(admin: AdminAuthResult, requestRowIdRaw: string) {
  if (!admin.status) return admin
  const eventRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(eventRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }

  const queryRunCheck = await eventM.findOne({ _id: eventRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Invalid Request Row Id' }, tokenStatus: true }

  const checkAccess = await checkSubadminAccess(subadminAccessParams(admin, eventRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message }, tokenStatus: true }

  if (queryRunCheck.active_status !== 0) {
    return { status: false, message: { alert_message: 'Sorry! This Event is already Enabled' } }
  }

  return submitLifecycleAction({ admin, eventRowId, intendedAction: 'enable', oldLabel: 'Disabled', newLabel: 'Enabled' })
}

export async function submitDisableEventRequest(admin: AdminAuthResult, requestRowIdRaw: string, disableReason: string) {
  if (!admin.status) return admin
  const eventRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(eventRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }

  const checkAccess = await checkSubadminAccess(subadminAccessParams(admin, eventRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  const queryRunCheck = await eventM.findOne({ _id: eventRowId })
  if (!queryRunCheck) return { status: false, message: { alert_message: 'Invalid Request Row Id' } }

  if (queryRunCheck.active_status !== 1) {
    return { status: false, message: { alert_message: 'Sorry! This Event is already Disabled' } }
  }

  return submitLifecycleAction({ admin, eventRowId, intendedAction: 'disable', reason: disableReason, oldLabel: 'Enabled', newLabel: 'Disabled' })
}

export async function submitApproveEventRequest(admin: AdminAuthResult, requestRowIdRaw: string) {
  if (!admin.status) return admin
  const eventRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(eventRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }

  const checkEvent = await eventM.findOne({ _id: eventRowId, approval_status: { $ne: 1 } }, { event_title: 1 })
  if (!checkEvent) return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }

  const checkAccess = await checkSubadminAccess(subadminAccessParams(admin, eventRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  return submitLifecycleAction({ admin, eventRowId, intendedAction: 'approve', oldLabel: 'Pending', newLabel: 'Approved' })
}

export async function submitRejectEventRequest(admin: AdminAuthResult, requestRowIdRaw: string, reasonForReject: string) {
  if (!admin.status) return admin
  const eventRowId = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(eventRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }

  const checkAccess = await checkSubadminAccess(subadminAccessParams(admin, eventRowId))
  if (!checkAccess.status) return { status: false, message: { alert_message: checkAccess.message } }

  const checkEvent = await eventM.findOne({ _id: eventRowId, approval_status: 0 }, { event_title: 1 })
  if (!checkEvent) return { status: false, message: { alert_message: 'Invalid Request Row Id' } }

  return submitLifecycleAction({ admin, eventRowId, intendedAction: 'reject', reason: reasonForReject, oldLabel: 'Pending', newLabel: 'Rejected' })
}
