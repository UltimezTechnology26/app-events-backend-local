// modules/company_admin/company_admin.approvals.controller.ts
import express, { Router } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getCompaniesList, approveCompanyRequest, rejectCompanyRequest, deleteCompanyRequest, getDeletedCompaniesList } from './company_admin.approvals.service'
import { asyncRoute } from '../../../middleware/asyncRoute'

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
