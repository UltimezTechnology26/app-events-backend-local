// modules/professionals/professionals.approvals.controller.ts
//
// Change-request review/publish routes for Professionals — mirrors
// company_admin.approvals.controller.ts's per-entity routes exactly (pending/approved changes,
// approve/reject whole-request and field-level, publish, cancel, audit trail), all calling the
// SAME shared change-request.service.ts/.approve.ts/.review.ts/.apply.ts functions Company's own
// controller already calls, parameterized with AUDIT_MODULE_PROFESSIONALS instead of
// AUDIT_MODULE_COMPANY. No new business logic here, only new endpoints — per this migration's
// "no new APIs beyond what's needed to expose already-generalized shared infra" rule.
//
// Deliberately NOT included yet (out of this pass's scope, unlike company_admin's own router):
// the global cross-professional '/pending_changes_all'/'/rejected_changes_all' queues and
// '/publish_all_changes/:user_row_id' — those need a professionals-specific display-info
// enrichment service (name/avatar per row, mirroring company_admin.approvals.service.ts's
// findCompaniesDisplayInfoByIds) that hasn't been built yet.
import express, { Router } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getEntityAudit } from '../../common/status-audit/status-audit.service'
import { validateAuditRequest } from '../../common/status-audit/status-audit.validation'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { getPendingChangeRequests, getApprovedChangeRequests, publishAllChangeRequests } from '../../modules/change-request/change-request.service'
import { getGlobalPendingChangeRequestsForProfessionals, getGlobalRejectedChangeRequestsForProfessionals } from './professionals.approvals.service'
import { applyChangeRequest } from '../../modules/change-request/change-request.apply'
import { approveChangeRequest, approveChangeRequestFields } from '../../modules/change-request/change-request.approve'
import { rejectChangeRequest, cancelChangeRequest, rejectChangeRequestFields } from '../../modules/change-request/change-request.review'
import {
  validateChangeRequestId,
  validateUserRowId,
  isMainAdmin,
  validateRating,
  validateNote,
  CHANGE_REQUEST_MESSAGES,
} from '../../modules/change-request/change-request.validation'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'

export const professionalsChangeApprovalsRouter: Router = express.Router()

// Matches professionals.controller.ts's own PROFESSIONALS_ACCESS_IDS ([1]) — the confirmed
// permission-id normalization decision for this module, not company_admin's [7].
const PROFESSIONALS_ACCESS_IDS = [1]

professionalsChangeApprovalsRouter.use((req, res, next) => {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)
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
 * Global cross-entity queue: every professional's pending changes together, paginated — not
 * scoped to one professional, unlike '/pending_changes/:user_row_id' below. Named
 * 'pending_changes_all' (its own literal path segment) so it can never collide with that route's
 * ':user_row_id' param — same convention as company_admin.approvals.controller.ts.
 */
professionalsChangeApprovalsRouter.get('/pending_changes_all/:skip/:limit', asyncRoute('Global professional pending changes queue.', async (req, res) => {
  const result = await getGlobalPendingChangeRequestsForProfessionals({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string })
  res.json(result)
}))

/** Same shape as '/pending_changes_all' above, but for rejected requests. */
professionalsChangeApprovalsRouter.get('/rejected_changes_all/:skip/:limit', asyncRoute('Global professional rejected changes queue.', async (req, res) => {
  const result = await getGlobalRejectedChangeRequestsForProfessionals({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string })
  res.json(result)
}))

professionalsChangeApprovalsRouter.get('/pending_changes/:user_row_id', asyncRoute('Professional pending changes.', async (req, res) => {
  const userId = validateUserRowId(req.params.user_row_id as string)
  if (!userId.valid || userId.value === null) {
    res.json({ status: false, message: { alert_message: userId.message } })
    return
  }

  const result = await getPendingChangeRequests({ module: AUDIT_MODULE_PROFESSIONALS, rootDocumentId: userId.value })
  res.json(result)
}))

professionalsChangeApprovalsRouter.get('/approved_changes/:user_row_id', asyncRoute('Professional approved changes.', async (req, res) => {
  const userId = validateUserRowId(req.params.user_row_id as string)
  if (!userId.valid || userId.value === null) {
    res.json({ status: false, message: { alert_message: userId.message } })
    return
  }

  const result = await getApprovedChangeRequests({ module: AUDIT_MODULE_PROFESSIONALS, rootDocumentId: userId.value })
  res.json(result)
}))

/**
 * Bulk-per-entity publish: every APPROVED request for this professional goes live in one action,
 * backing a "Publish (N)" button the same way company_admin.approvals.controller.ts's
 * '/publish_all_changes/:company_row_id' does.
 */
professionalsChangeApprovalsRouter.post('/publish_all_changes/:user_row_id', writeEndpointRateLimiter, asyncRoute('Publish all approved professional changes.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)

  // Maker-checker: a sub-admin submits but may never publish (same design invariant as Company).
  if (!isMainAdmin(checkToken.message.admin_manager_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const userId = validateUserRowId(req.params.user_row_id as string)
  if (!userId.valid || userId.value === null) {
    res.json({ status: false, message: { alert_message: userId.message } })
    return
  }

  const result = await publishAllChangeRequests({ module: AUDIT_MODULE_PROFESSIONALS, rootDocumentId: userId.value, actor: adminActorOf(checkToken) })
  res.json(result)
}))

professionalsChangeApprovalsRouter.post('/publish_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Publish professional change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)

  // Maker-checker: a sub-admin submits but may never publish (same design invariant as Company).
  if (!isMainAdmin(checkToken.message.admin_manager_type)) {
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

professionalsChangeApprovalsRouter.post('/approve_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Approve professional change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)

  if (!isMainAdmin(checkToken.message.admin_manager_type)) {
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

professionalsChangeApprovalsRouter.post('/reject_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Reject professional change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)

  if (!isMainAdmin(checkToken.message.admin_manager_type)) {
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

professionalsChangeApprovalsRouter.post('/approve_change_fields/:change_request_id', writeEndpointRateLimiter, asyncRoute('Approve individual professional change request fields.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)

  if (!isMainAdmin(checkToken.message.admin_manager_type)) {
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

professionalsChangeApprovalsRouter.post('/reject_change_fields/:change_request_id', writeEndpointRateLimiter, asyncRoute('Reject individual professional change request fields.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)

  if (!isMainAdmin(checkToken.message.admin_manager_type)) {
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

professionalsChangeApprovalsRouter.post('/cancel_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Cancel professional change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const result = await cancelChangeRequest({ changeRequestId: requestId.value, actor: adminActorOf(checkToken) })
  res.json(result)
}))

/**
 * Lifecycle audit trail for one professional: the current stamps from cln_entity_lifecycle plus a
 * paginated history from cln_change_logs — same shape as company_admin.approvals.controller.ts's
 * own '/audit/:company_row_id/:skip/:limit'.
 */
professionalsChangeApprovalsRouter.get('/audit/:user_row_id/:skip/:limit', asyncRoute('Professional audit trail.', async (req, res) => {
  const validation = validateAuditRequest({
    documentId: req.params.user_row_id as string,
    skip: req.params.skip as string,
    limit: req.params.limit as string,
  })
  if (!validation.valid || validation.params === null) {
    res.json({ status: false, message: { alert_message: validation.message } })
    return
  }

  const result = await getEntityAudit({ module: AUDIT_MODULE_PROFESSIONALS, ...validation.params })
  res.json(result)
}))
