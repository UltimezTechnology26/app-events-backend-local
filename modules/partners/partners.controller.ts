// modules/partners/partners.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkUserLoginToken, checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import {
  submitRequestToBecomePartner,
  getPartnersUniqueBusinesses,
  getPartnerListDetails,
  getPartnerRequestsList,
  approvePartnerRequest,
  rejectPartnerRequest,
  removeFromPartner,
  addToPartners,
  getAdminPartnersList,
} from './partners.service'
import { rejectPartnerRequestValidation } from './partners.validation'

/**
 * Ports every Domain-A ("company partners") route across the codebase (Part 3 §7 Phase G step 5,
 * expanded scope) into its own module, `modules/partners/`, per the user's explicit direction.
 * Three routers, mounted at each real source's separate original prefix so every existing
 * frontend call site stays unchanged:
 * - `partnersAppRouter` — app-side, at '/company/front_page' (front_page.js)
 * - `partnersRequestsAdminRouter` — at '/company/requests_to_partners' (requests_to_partners.js)
 * - `partnersAdminRouter` — at '/company' (company.js's add_to_partners/remove_from_partner/partners_list)
 */
export const partnersAppRouter: Router = express.Router()
export const partnersRequestsAdminRouter: Router = express.Router()
export const partnersAdminRouter: Router = express.Router()

// ─── App-side ───────────────────────────────────────────────────────────────

partnersAppRouter.get('/partners_list/:skip/:limit', async (req: Request, res: Response) => {
  try {
    let user_row_id = 0
    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
      user_row_id = checkUserToken.message
    }
    const skip = Number.parseInt(req.params.skip as string) || 0
    const limit = Number.parseInt(req.params.limit as string) || 100
    const result = await getPartnerListDetails({ reqQuery: req.query, skip, limit, userRowId: user_row_id })
    res.json(result)
  } catch (err: any) {
    console.log('Partners list.', err.message)
    res.json({ status: false, message: 'Server error, try again later'})
  }
})

partnersAppRouter.get('/submit_request_to_become_partner', async (req: Request, res: Response) => {
  try {
    const actor = checkUserLoginToken(req.headers)
    const result = await submitRequestToBecomePartner({ actor })
    res.json(result)
  } catch (err: any) {
    console.log('Submit request as working.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

partnersAppRouter.get('/partners_unique_businesses', async (req: Request, res: Response) => {
  try {
    const result = await getPartnersUniqueBusinesses()
    res.json(result)
  } catch (err: any) {
    console.log('Partners unique business.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// ─── Admin-side: partner requests ──────────────────────────────────────────

partnersRequestsAdminRouter.get('/list/:approval_status/:skip/:limit', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getPartnerRequestsList({
      actor,
      approvalStatusRaw: req.params.approval_status as string,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      profileScore: req.query.profile_score as string | undefined,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Company claim requests list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

partnersRequestsAdminRouter.get('/approve_request/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await approvePartnerRequest({ actor, requestRowIdRaw: req.params.request_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Company  requests Approve.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

partnersRequestsAdminRouter.post('/reject_request/:request_row_id', rejectPartnerRequestValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const actor = checkAdminLoginToken(req.headers, [7])
    const result = await rejectPartnerRequest({ actor, requestRowIdRaw: req.params.request_row_id as string, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Company Partner requests reject.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

// ─── Admin-side: direct partner toggle + directory ─────────────────────────

partnersAdminRouter.get('/remove_from_partner/:company_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await removeFromPartner({ actor, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Remove from Partners list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

partnersAdminRouter.get('/add_to_partners/:company_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await addToPartners({ actor, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Add to Partners list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

partnersAdminRouter.get('/partners_list/:skip/:limit', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  try {
    const result = await getAdminPartnersList({
      actor,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string | undefined,
      profileScore: req.query.profile_score as string | undefined,
    })
    res.json(result)
  } catch (err: any) {
    console.log('Partners list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})
