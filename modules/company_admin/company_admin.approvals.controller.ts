// modules/company_admin/company_admin.approvals.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import { getCompaniesList, approveCompanyRequest, rejectCompanyRequest, deleteCompanyRequest, getDeletedCompaniesList } from './company_admin.approvals.service'

/**
 * Ports controllers/admin_panel/app/company_approvals.js's 5 routes (Part 3 §7 Phase H step 2) —
 * scaffolded as its own file within modules/company_admin/, per the file-per-concern convention
 * already used for Settings/FAQ in modules/company/. Mounted at the real source's original prefix
 * ('/company_approvals') to preserve every existing admin-coinpedia call site unchanged.
 */
export const companyAdminApprovalsRouter: Router = express.Router()

companyAdminApprovalsRouter.get('/companies_list/:approval_status/:active_status/:skip/:limit', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
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
  } catch (err: any) {
    console.log('Companies list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyAdminApprovalsRouter.get('/approve_request/:request_row_id', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await approveCompanyRequest({ admin: checkToken, requestRowIdRaw: req.params.request_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Approve company request.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyAdminApprovalsRouter.post(
  '/reject_request/:request_row_id',
  [check('reason_rejected').trim().not().isEmpty().withMessage('The Reason Rejected field is required')],
  async (req: Request, res: Response) => {
    try {
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
    } catch (err: any) {
      console.log('Reject company.', err.message)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  },
)

companyAdminApprovalsRouter.get('/delete_company/:request_row_id', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await deleteCompanyRequest({ admin: checkToken, requestRowIdRaw: req.params.request_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Delete company.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyAdminApprovalsRouter.get('/deleted_list/:skip/:limit', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await getDeletedCompaniesList({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string, search: req.query.search as string | undefined })
    res.json(result)
  } catch (err: any) {
    console.log('Deleted companies list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
