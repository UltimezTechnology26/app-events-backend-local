// modules/partners/partners.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkUserLoginToken, checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import logger from '../../../config/logger'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
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

// Additive safety net: every route in this router requires checkAdminLoginToken(req.headers, [7]).
// Registered before any route handlers so it applies regardless of definition order below.
partnersRequestsAdminRouter.use(requireAdminAccess([7]))

// Additive safety net: every route in this router requires checkAdminLoginToken(req.headers, [7]).
partnersAdminRouter.use(requireAdminAccess([7]))

// ─── App-side ───────────────────────────────────────────────────────────────

// Additive safety net: matches submitRequestToBecomePartner's `if (!actor.status) return actor`
// — response on failure is the raw checkUserLoginToken return value. Not applied router-wide:
// /partners_list is soft-gated (login only personalizes results, defaults to user_row_id 0) and
// /partners_unique_businesses is fully public.
function requireUserLogin(req: Request): { status: false; message: any } | null {
  const checkUserToken = checkUserLoginToken(req.headers)
  return checkUserToken.status ? null : checkUserToken
}

// Soft-gated — no auth required: checkUserLoginToken here only personalizes the response
// (user_row_id stays 0 for an anonymous caller), matching existing handler behavior.
// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #27.
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
  } catch (err: unknown) {
    logger.error(`Partners list. ${err instanceof Error ? err.message : String(err)}`)
    res.json({ status: false, message: 'Server error, try again later'})
  }
})

partnersAppRouter.get('/submit_request_to_become_partner', asyncRoute('Submit request as working.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const actor = checkUserLoginToken(req.headers)
  const result = await submitRequestToBecomePartner({ actor })
  res.json(result)
}))

// Public — no auth required, matches existing handler behavior.
partnersAppRouter.get('/partners_unique_businesses', asyncRoute('Partners unique business.', async (req, res) => {
  const result = await getPartnersUniqueBusinesses()
  res.json(result)
}))

// ─── Admin-side: partner requests ──────────────────────────────────────────

partnersRequestsAdminRouter.get('/list/:approval_status/:skip/:limit', asyncRoute('Company claim requests list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getPartnerRequestsList({
    actor,
    approvalStatusRaw: req.params.approval_status as string,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string | undefined,
    profileScore: req.query.profile_score as string | undefined,
  })
  res.json(result)
}))

partnersRequestsAdminRouter.get('/approve_request/:request_row_id', asyncRoute('Company  requests Approve.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await approvePartnerRequest({ actor, requestRowIdRaw: req.params.request_row_id as string })
  res.json(result)
}))

partnersRequestsAdminRouter.post('/reject_request/:request_row_id', writeEndpointRateLimiter, rejectPartnerRequestValidation, asyncRoute('Company Partner requests reject.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await rejectPartnerRequest({ actor, requestRowIdRaw: req.params.request_row_id as string, body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

// ─── Admin-side: direct partner toggle + directory ─────────────────────────

partnersAdminRouter.get('/remove_from_partner/:company_row_id', asyncRoute('Remove from Partners list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await removeFromPartner({ actor, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

partnersAdminRouter.get('/add_to_partners/:company_row_id', asyncRoute('Add to Partners list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await addToPartners({ actor, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

partnersAdminRouter.get('/partners_list/:skip/:limit', asyncRoute('Partners list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [7])
  const result = await getAdminPartnersList({
    actor,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string | undefined,
    profileScore: req.query.profile_score as string | undefined,
  })
  res.json(result)
}))
