// modules/company_claim_requests/company_claim_requests.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken, checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
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

/**
 * Additive safety net: every route on this router uses checkUserLoginToken(req.headers) as a
 * hard gate (enforced today inside company_claim_requests.service.ts, which returns the actor
 * object unchanged when actor.status is false). Does not replace that per-handler/service check.
 */
companyClaimRequestsAppRouter.use((req: Request, res: Response, next) => {
  const actor = checkUserLoginToken(req.headers)
  if (!actor.status) {
    return res.json(actor)
  }
  next()
})

companyClaimRequestsAppRouter.get('/save_claim_request_details/:company_row_id', asyncRoute('Save claim request details.', async (req, res) => {
  const actor = checkUserLoginToken(req.headers)
  const result = await saveClaimRequestDetails({ actor, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

companyClaimRequestsAppRouter.post(
  '/claim_company',
  writeEndpointRateLimiter,
  [check('company_row_id').trim().not().isEmpty().withMessage('The Company Row ID field is required.')],
  asyncRoute('Claim company.', async (req, res) => {
    const errObj = arrangeValidation(validationResult(req))
    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }

    const actor = checkUserLoginToken(req.headers)
    const result = await claimCompany({ actor, companyRowIdRaw: req.body.company_row_id })
    res.json(result)
  }),
)

companyClaimRequestsAppRouter.get('/verify_claim/:claim_token', asyncRoute('Verify claim.', async (req, res) => {
  const actor = checkUserLoginToken(req.headers)
  const result = await verifyClaim({ actor, claimTokenRaw: req.params.claim_token as string })
  res.json(result)
}))

// ─── Admin-side ─────────────────────────────────────────────────────────────

// Additive safety net: every admin route in this router requires checkAdminLoginToken(req.headers, [7]).
companyClaimRequestsAdminRouter.use(requireAdminAccess([7]))

companyClaimRequestsAdminRouter.get('/list/:claim_status/:skip/:limit', asyncRoute('Company claim requests list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getClaimRequestsList({
    claimStatusRaw: req.params.claim_status as string,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string | undefined,
  })
  res.json(result)
}))

companyClaimRequestsAdminRouter.get('/approve_request/:request_row_id', writeEndpointRateLimiter, asyncRoute('Company claim requests Approve.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await approveClaimRequest({ admin: checkToken, requestRowIdRaw: req.params.request_row_id as string })
  res.json(result)
}))

companyClaimRequestsAdminRouter.post(
  '/reject_request/:request_row_id',
  writeEndpointRateLimiter,
  [check('rejected_reason').trim().not().isEmpty().withMessage('The Reason Rejected field is required')],
  asyncRoute('Company claim requests reject.', async (req, res) => {
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
  }),
)
