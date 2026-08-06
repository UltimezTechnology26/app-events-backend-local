// modules/company_claim_requests/company_claim_requests.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken, checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import {
  saveClaimRequestDetails,
  claimCompany,
  verifyClaim,
  getClaimRequestsList,
  approveClaimRequest,
  rejectClaimRequest,
} from './company_claim_requests.service'

/**
 * Ports front_page.js's 3 claim routes (Flow A: save_claim_request_details; Flow B: claim_company
 * + verify_claim) and claim_requests.js's 3 admin routes (list, approve_request, reject_request) —
 * Part 3 §7 Phase G step 6. Mounted at the real source's original prefixes so every existing
 * frontend call site stays unchanged: app routes under '/company/front_page' (front_page.js's own
 * mount point), admin routes under '/company_claim_requests'.
 */
export const companyClaimRequestsAppRouter: Router = express.Router()
export const companyClaimRequestsAdminRouter: Router = express.Router()

// ─── App-side ───────────────────────────────────────────────────────────────

companyClaimRequestsAppRouter.get('/save_claim_request_details/:company_row_id', async (req: Request, res: Response) => {
  try {
    const actor = checkUserLoginToken(req.headers)
    const result = await saveClaimRequestDetails({ actor, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Save claim request details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyClaimRequestsAppRouter.post(
  '/claim_company',
  [check('company_row_id').trim().not().isEmpty().withMessage('The Company Row ID field is required.')],
  async (req: Request, res: Response) => {
    try {
      const errObj = arrangeValidation(validationResult(req))
      if (Object.keys(errObj).length > 0) {
        res.json({ status: false, message: errObj })
        return
      }

      const actor = checkUserLoginToken(req.headers)
      const result = await claimCompany({ actor, companyRowIdRaw: req.body.company_row_id })
      res.json(result)
    } catch (err: any) {
      console.log('Claim company.', err.message)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  },
)

companyClaimRequestsAppRouter.get('/verify_claim/:claim_token', async (req: Request, res: Response) => {
  try {
    const actor = checkUserLoginToken(req.headers)
    const result = await verifyClaim({ actor, claimTokenRaw: req.params.claim_token as string })
    res.json(result)
  } catch (err: any) {
    console.log('Verify claim.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// ─── Admin-side ─────────────────────────────────────────────────────────────

companyClaimRequestsAdminRouter.get('/list/:claim_status/:skip/:limit', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await getClaimRequestsList({
      claimStatusRaw: req.params.claim_status as string,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Company claim requests list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyClaimRequestsAdminRouter.get('/approve_request/:request_row_id', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await approveClaimRequest({ admin: checkToken, requestRowIdRaw: req.params.request_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Company claim requests Approve.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyClaimRequestsAdminRouter.post(
  '/reject_request/:request_row_id',
  [check('rejected_reason').trim().not().isEmpty().withMessage('The Reason Rejected field is required')],
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

      const result = await rejectClaimRequest({
        admin: checkToken,
        requestRowIdRaw: req.params.request_row_id as string,
        rejectedReason: req.body.rejected_reason,
      })
      res.json(result)
    } catch (err: any) {
      console.log('Company claim requests reject.', err.message)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  },
)
