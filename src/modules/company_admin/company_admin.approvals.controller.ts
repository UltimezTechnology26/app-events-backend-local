// modules/company_admin/company_admin.approvals.controller.ts
import express, { Router } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getCompaniesList, approveCompanyRequest, rejectCompanyRequest, deleteCompanyRequest, getDeletedCompaniesList, getGlobalPendingChangeRequests, getGlobalRejectedChangeRequests } from './company_admin.approvals.service'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getEntityAudit } from '../../common/status-audit/status-audit.service'
import { validateAuditRequest } from '../../common/status-audit/status-audit.validation'
import { AUDIT_MODULE_COMPANY } from '../../common/status-audit/status-audit.registry'
import { getPendingChangeRequests, getApprovedChangeRequests, publishAllChangeRequests } from '../../common/change-request/change-request.service'
import { applyChangeRequest } from '../../common/change-request/change-request.apply'
import { approveChangeRequest } from '../../common/change-request/change-request.approve'
import { rejectChangeRequest, cancelChangeRequest } from '../../common/change-request/change-request.review'
import {
  validateChangeRequestId,
  validateCompanyRowId,
  isMainAdmin,
  validateRating,
  validateNote,
  CHANGE_REQUEST_MESSAGES,
} from '../../common/change-request/change-request.validation'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'

/**
 * Ports controllers/admin_panel/app/company_approvals.js's 5 routes (Part 3 §7 Phase H step 2) —
 * scaffolded as its own file within modules/company_admin/, per the file-per-concern convention
 * already used for Settings/FAQ in modules/company/. Mounted at the real source's original prefix
 * ('/company_approvals') to preserve every existing admin-coinpedia call site unchanged.
 */
export const companyAdminApprovalsRouter: Router = express.Router()

// Additive safety net: every route in this router requires checkAdminLoginToken(req.headers, [7]),
// matching the shared requireAdminAccess helper already used by company.categories.controller.ts.
// Existing per-handler checks below are left in place unchanged.
companyAdminApprovalsRouter.use(requireAdminAccess([7]))

companyAdminApprovalsRouter.get('/companies_list/:approval_status/:active_status/:skip/:limit', asyncRoute('Companies list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getCompaniesList({
    approvalStatusRaw: req.params.approval_status as string,
    activeStatusRaw: req.params.active_status as string,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string | undefined,
    profileScoreRange: req.query.profile_score as string | undefined,
    categoryStatusRaw: req.query.category_status as string | undefined,
  })
  res.json(result)
}))

companyAdminApprovalsRouter.get('/approve_request/:request_row_id', writeEndpointRateLimiter, asyncRoute('Approve company request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await approveCompanyRequest({ admin: checkToken, requestRowIdRaw: req.params.request_row_id as string })
  res.json(result)
}))

companyAdminApprovalsRouter.post(
  '/reject_request/:request_row_id',
  writeEndpointRateLimiter,
  [check('reason_rejected').trim().not().isEmpty().withMessage('The Reason Rejected field is required')],
  asyncRoute('Reject company.', async (req, res) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (!checkToken.status) {
      errObj['alert_message'] = checkToken.message
    }

    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }

    const result = await rejectCompanyRequest({ admin: checkToken, requestRowIdRaw: req.params.request_row_id as string, reasonRejected: req.body.reason_rejected })
    res.json(result)
  }),
)

companyAdminApprovalsRouter.get('/delete_company/:request_row_id', writeEndpointRateLimiter, asyncRoute('Delete company.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await deleteCompanyRequest({ admin: checkToken, requestRowIdRaw: req.params.request_row_id as string })
  res.json(result)
}))

companyAdminApprovalsRouter.get('/deleted_list/:skip/:limit', asyncRoute('Deleted companies list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getDeletedCompaniesList({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string, search: req.query.search as string | undefined })
  res.json(result)
}))

/**
 * Lifecycle audit trail for one company: the current stamps from cln_entity_lifecycle
 * plus a paginated history from cln_change_logs. Parsing and guarding live in
 * status-audit.validation.ts so this handler only validates, delegates and responds.
 */
companyAdminApprovalsRouter.get('/audit/:company_row_id/:skip/:limit', asyncRoute('Company audit trail.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const validation = validateAuditRequest({
    documentId: req.params.company_row_id as string,
    skip: req.params.skip as string,
    limit: req.params.limit as string,
  })
  if (!validation.valid || validation.params === null) {
    res.json({ status: false, message: { alert_message: validation.message } })
    return
  }

  const result = await getEntityAudit({ module: AUDIT_MODULE_COMPANY, ...validation.params })
  res.json(result)
}))

const adminActorOf = (checkToken: { message: { admin_manager_type?: unknown; admin_row_id?: unknown } }) =>
  toActorRefWithId(
    {
      updated_by: isMainAdmin(checkToken.message.admin_manager_type) ? 'admin' : 'subadmin',
      updated_by_row_id: Number(checkToken.message.admin_row_id),
    },
    Number(checkToken.message.admin_row_id),
  )

/**
 * Global cross-entity queue: every company's pending changes together, paginated — not scoped
 * to one company, unlike '/pending_changes/:company_row_id' below. Named 'pending_changes_all'
 * (its own literal path segment) so it can never collide with that route's ':company_row_id'
 * param.
 */
companyAdminApprovalsRouter.get('/pending_changes_all/:skip/:limit', asyncRoute('Global pending changes queue.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getGlobalPendingChangeRequests({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string })
  res.json(result)
}))

/** Same shape as '/pending_changes_all' above, but for rejected requests — mirrors markets' own Pending/Rejected Changes tab pair. */
companyAdminApprovalsRouter.get('/rejected_changes_all/:skip/:limit', asyncRoute('Global rejected changes queue.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getGlobalRejectedChangeRequests({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string })
  res.json(result)
}))

companyAdminApprovalsRouter.get('/pending_changes/:company_row_id', asyncRoute('Company pending changes.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const companyId = validateCompanyRowId(req.params.company_row_id as string)
  if (!companyId.valid || companyId.value === null) {
    res.json({ status: false, message: { alert_message: companyId.message } })
    return
  }

  const result = await getPendingChangeRequests({ module: AUDIT_MODULE_COMPANY, rootDocumentId: companyId.value })
  res.json(result)
}))

companyAdminApprovalsRouter.get('/approved_changes/:company_row_id', asyncRoute('Company approved changes.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const companyId = validateCompanyRowId(req.params.company_row_id as string)
  if (!companyId.valid || companyId.value === null) {
    res.json({ status: false, message: { alert_message: companyId.message } })
    return
  }

  const result = await getApprovedChangeRequests({ module: AUDIT_MODULE_COMPANY, rootDocumentId: companyId.value })
  res.json(result)
}))

companyAdminApprovalsRouter.post('/publish_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Publish company change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  // Maker-checker: a sub-admin submits but may never publish (design §13.1 item 3).
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

/**
 * Bulk-per-entity publish: every APPROVED request for this company goes live in one action,
 * backing a "Publish (N)" button the same way markets' root_document_id-scoped publish route
 * does — instead of publishing one change request at a time via '/publish_change/:id' above.
 */
companyAdminApprovalsRouter.post('/publish_all_changes/:company_row_id', writeEndpointRateLimiter, asyncRoute('Publish all approved company changes.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  // Maker-checker: a sub-admin submits but may never publish (design §13.1 item 3).
  if (!isMainAdmin(checkToken.message.admin_manager_type)) {
    res.json({ status: false, message: { alert_message: CHANGE_REQUEST_MESSAGES.PUBLISH_FORBIDDEN } })
    return
  }

  const companyId = validateCompanyRowId(req.params.company_row_id as string)
  if (!companyId.valid || companyId.value === null) {
    res.json({ status: false, message: { alert_message: companyId.message } })
    return
  }

  const result = await publishAllChangeRequests({ module: AUDIT_MODULE_COMPANY, rootDocumentId: companyId.value, actor: adminActorOf(checkToken) })
  res.json(result)
}))

companyAdminApprovalsRouter.post('/approve_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Approve company change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

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

companyAdminApprovalsRouter.post('/reject_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Reject company change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

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

companyAdminApprovalsRouter.post('/cancel_change/:change_request_id', writeEndpointRateLimiter, asyncRoute('Cancel company change request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const requestId = validateChangeRequestId(req.params.change_request_id as string)
  if (!requestId.valid || requestId.value === null) {
    res.json({ status: false, message: { alert_message: requestId.message } })
    return
  }

  const result = await cancelChangeRequest({ changeRequestId: requestId.value, actor: adminActorOf(checkToken) })
  res.json(result)
}))
