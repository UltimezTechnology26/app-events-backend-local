// modules/events-change-approvals/events.change-approvals.controller.ts
//
// Change-request review/publish routes for Events - mirrors professionals.approvals.controller.ts
// exactly (pending/approved/rejected global queues, per-entity pending/approved, approve/reject
// whole-request and field-level, publish whole-request/field-level, cancel, audit trail), all
// calling the SAME shared change-request.service.ts/.approve.ts/.review.ts/.apply.ts functions
// Company/Professionals' own controllers already call, parameterized with AUDIT_MODULE_EVENTS.
// No new business logic here, only new endpoints — per this migration's "no new APIs beyond what's
// needed to expose already-generalized shared infra" rule.
import express, { Router } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getEntityAudit } from '../../common/status-audit/status-audit.service'
import { validateAuditRequest } from '../../common/status-audit/status-audit.validation'
import { AUDIT_MODULE_EVENTS } from '../../common/status-audit/status-audit.registry'
import { getPendingChangeRequests, getApprovedChangeRequests, publishAllChangeRequests } from '../../modules/change-request/change-request.service'
import { getGlobalPendingChangeRequestsForEvents, getGlobalRejectedChangeRequestsForEvents, getGlobalApprovedChangeRequestsForEvents } from './events.change-approvals.service'
import { applyChangeRequest } from '../../modules/change-request/change-request.apply'
import { approveChangeRequest, approveChangeRequestFields } from '../../modules/change-request/change-request.approve'
import { rejectChangeRequest, cancelChangeRequest, rejectChangeRequestFields } from '../../modules/change-request/change-request.review'
import {
  validateChangeRequestId,
  validateEventRowId,
  isMainAdmin,
  canApproveChangeRequests,
  validateRating,
  validateNote,
  CHANGE_REQUEST_MESSAGES,
} from '../../modules/change-request/change-request.validation'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'

export const eventsChangeApprovalsRouter: Router = express.Router()

// Matches events.controller.ts's own EVENTS_ACCESS_IDS ([10]) - the confirmed permission-id
// normalization decision for this module.
const EVENTS_ACCESS_IDS = [10]

eventsChangeApprovalsRouter.use((req, res, next) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

const adminActorOf = (checkToken: { message: { admin_manager_type?: unknown; admin_row_id?: unknown } }) =>
  toActorRefWithId(
    {
      updated_by: isMainAdmin(checkToken.message.admin_manager_type) ? 'admin' : 'subadmin',
      updated_by_row_id: Number(checkToken.message.admin_row_id),
    },
    Number(checkToken.message.admin_row_id),
  )

/**
 * Global cross-entity queue: every event's pending changes together, paginated - not scoped to
 * one event, unlike '/pending_changes/:event_row_id' below. Named 'pending_changes_all' (its own
 * literal path segment) so it can never collide with that route's ':event_row_id' param - same
 * convention as company_admin.approvals.controller.ts/professionals.approvals.controller.ts.
 */
eventsChangeApprovalsRouter.get('/pending_changes_all/:skip/:limit', asyncRoute('Global event pending changes queue.', async (req, res) => {
  const result = await getGlobalPendingChangeRequestsForEvents({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string })
  res.json(result)
}))

/** Same shape as '/pending_changes_all' above, but for rejected requests. */
eventsChangeApprovalsRouter.get('/rejected_changes_all/:skip/:limit', asyncRoute('Global event rejected changes queue.', async (req, res) => {
  const result = await getGlobalRejectedChangeRequestsForEvents({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string })
  res.json(result)
}))

/** Global cross-entity queue: every event's approved-but-not-yet-published changes together, paginated. */
eventsChangeApprovalsRouter.get('/approved_changes_all/:skip/:limit', asyncRoute('Global event approved changes queue.', async (req, res) => {
  const result = await getGlobalApprovedChangeRequestsForEvents({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string })
  res.json(result)
}))

eventsChangeApprovalsRouter.get('/pending_changes/:event_row_id', asyncRoute('Event pending changes.', async (req, res) => {
  const eventId = validateEventRowId(req.params.event_row_id as string)
  if (!eventId.valid || eventId.value === null) {
    res.json({ status: false, message: { alert_message: eventId.message } })
    return
  }

  const result = await getPendingChangeRequests({ module: AUDIT_MODULE_EVENTS, rootDocumentId: eventId.value })
  res.json(result)
}))

eventsChangeApprovalsRouter.get('/approved_changes/:event_row_id', asyncRoute('Event approved changes.', async (req, res) => {
  const eventId = validateEventRowId(req.params.event_row_id as string)
  if (!eventId.valid || eventId.value === null) {
    res.json({ status: false, message: { alert_message: eventId.message } })
    return
  }

  const result = await getApprovedChangeRequests({ module: AUDIT_MODULE_EVENTS, rootDocumentId: eventId.value })
  res.json(result)
}))

/**
 * Bulk-per-entity publish: every APPROVED request for this event goes live in one action, backing
 * a "Publish (N)" button the same way company_admin/professionals' own '/publish_all_changes' do.
 */
eventsChangeApprovalsRouter.post('/publish_all_changes/:event_row_id', writeEndpointRateLimiter, asyncRoute('Publish all approved event changes.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)

  // Maker-checker: a sub-admin submits but may never publish (same design invariant as Company/Professionals).
  if (!canApproveChangeRequests(checkToken.message.admin_manager_type, checkToken.message.sub_admin_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const eventId = validateEventRowId(req.params.event_row_id as string)
  if (!eventId.valid || eventId.value === null) {
    res.json({ status: false, message: { alert_message: eventId.message } })
    return
  }

  const result = await publishAllChangeRequests({ module: AUDIT_MODULE_EVENTS, rootDocumentId: eventId.value, actor: adminActorOf(checkToken) })
  res.json(result)
}))

eventsChangeApprovalsRouter.post('/publish_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Publish event change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)

  if (!canApproveChangeRequests(checkToken.message.admin_manager_type, checkToken.message.sub_admin_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const result = await applyChangeRequest({ changeRequestId: requestId.value, actor: adminActorOf(checkToken) })
  res.json(result)
}))

const FIELD_KEYS_REQUIRED_FOR_PUBLISH_MESSAGE = 'Select at least one field to publish'

/**
 * Field-level selective publish: publishes only the given subset of this request's
 * approved-and-unpublished fields, leaving the rest approved-but-unpublished for a later publish -
 * mirrors company_admin/professionals' own '/publish_change_fields'. '/publish_change' above (no
 * body) still publishes every approved-and-unpublished field on the request, unchanged.
 */
eventsChangeApprovalsRouter.post('/publish_change_fields/:change_request_id', writeEndpointRateLimiter, asyncRoute('Publish individual event change request fields.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)

  if (!canApproveChangeRequests(checkToken.message.admin_manager_type, checkToken.message.sub_admin_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const fieldKeys = validateFieldKeys(req.body.field_keys)
  if (!fieldKeys) {
    res.json({ status: false, message: { field_keys: FIELD_KEYS_REQUIRED_FOR_PUBLISH_MESSAGE } })
    return
  }

  const result = await applyChangeRequest({ changeRequestId: requestId.value, actor: adminActorOf(checkToken), fieldKeys })
  res.json(result)
}))

eventsChangeApprovalsRouter.post('/approve_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Approve event change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)

  if (!canApproveChangeRequests(checkToken.message.admin_manager_type, checkToken.message.sub_admin_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const rating = validateRating(req.body.rating)
  if (!rating.valid || rating.value === null) {
    res.json({ status: false, message: { rating: rating.message } })
    return
  }

  const note = validateNote(req.body.note)
  if (!note.valid || note.value === null) {
    res.json({ status: false, message: { note: note.message } })
    return
  }

  const result = await approveChangeRequest({ changeRequestId: requestId.value, actor: adminActorOf(checkToken), rating: rating.value, note: note.value })
  res.json(result)
}))

eventsChangeApprovalsRouter.post('/reject_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Reject event change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)

  if (!canApproveChangeRequests(checkToken.message.admin_manager_type, checkToken.message.sub_admin_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (reason === '') {
    res.json({ status: false, message: { reason: CHANGE_REQUEST_MESSAGES.REASON_REQUIRED } })
    return
  }

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const result = await rejectChangeRequest({ changeRequestId: requestId.value, actor: adminActorOf(checkToken), reason })
  res.json(result)
}))

const FIELD_KEYS_REQUIRED_MESSAGE = 'Select at least one field to approve or reject'

function validateFieldKeys(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  if (!raw.every((key) => typeof key === 'string' && key.trim() !== '')) return null
  return raw
}

eventsChangeApprovalsRouter.post('/approve_change_fields/:change_request_id', writeEndpointRateLimiter, asyncRoute('Approve individual event change request fields.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)

  if (!canApproveChangeRequests(checkToken.message.admin_manager_type, checkToken.message.sub_admin_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const fieldKeys = validateFieldKeys(req.body.field_keys)
  if (!fieldKeys) {
    res.json({ status: false, message: { field_keys: FIELD_KEYS_REQUIRED_MESSAGE } })
    return
  }

  const rating = validateRating(req.body.rating)
  if (!rating.valid || rating.value === null) {
    res.json({ status: false, message: { rating: rating.message } })
    return
  }

  const note = typeof req.body.note === 'string' ? req.body.note : undefined

  const result = await approveChangeRequestFields({
    changeRequestId: requestId.value,
    fieldKeys,
    actor: adminActorOf(checkToken),
    rating: rating.value,
    note,
  })
  res.json(result)
}))

eventsChangeApprovalsRouter.post('/reject_change_fields/:change_request_id', writeEndpointRateLimiter, asyncRoute('Reject individual event change request fields.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)

  if (!canApproveChangeRequests(checkToken.message.admin_manager_type, checkToken.message.sub_admin_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const fieldKeys = validateFieldKeys(req.body.field_keys)
  if (!fieldKeys) {
    res.json({ status: false, message: { field_keys: FIELD_KEYS_REQUIRED_MESSAGE } })
    return
  }

  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (reason === '') {
    res.json({ status: false, message: { reason: CHANGE_REQUEST_MESSAGES.REASON_REQUIRED } })
    return
  }

  const result = await rejectChangeRequestFields({
    changeRequestId: requestId.value,
    fieldKeys,
    actor: adminActorOf(checkToken),
    reason,
  })
  res.json(result)
}))

eventsChangeApprovalsRouter.post('/cancel_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Cancel event change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const result = await cancelChangeRequest({ changeRequestId: requestId.value, actor: adminActorOf(checkToken) })
  res.json(result)
}))

/**
 * Lifecycle audit trail for one event: the current stamps from cln_entity_lifecycle plus a
 * paginated history from cln_change_logs - same shape as company_admin/professionals' own
 * '/audit/:id/:skip/:limit'.
 */
eventsChangeApprovalsRouter.get('/audit/:event_row_id/:skip/:limit', asyncRoute('Event audit trail.', async (req, res) => {
  const validation = validateAuditRequest({
    documentId: req.params.event_row_id as string,
    skip: req.params.skip as string,
    limit: req.params.limit as string,
  })
  if (!validation.valid || validation.params === null) {
    res.json({ status: false, message: { alert_message: validation.message } })
    return
  }

  const result = await getEntityAudit({ module: AUDIT_MODULE_EVENTS, ...validation.params })
  res.json(result)
}))
