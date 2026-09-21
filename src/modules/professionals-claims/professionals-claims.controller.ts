// modules/professionals-claims/professionals-claims.controller.ts
//
// Phase E of the Professionals migration (see plan doc). Ports the 8 claim-request routes out of
// controllers/admin_panel/app/user.js (~3928-4535) into a dedicated module.
//
// Mounted at a temporary `_v2` prefix (routes/admin_panel.js: '/users_claims_v2') parallel to the
// untouched legacy '/users' mount — legacy user.js has thousands of other lines not in this
// phase's scope and stays fully live.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  getPendingList, getApprovedList, getRejectedList,
  rejectRequest, rejectClaim, acceptClaim, deleteClaim, viewClaim,
} from './professionals-claims.service'
import { AdminAuthResult } from './professionals-claims.types'

export const professionalsClaimsRouter: Router = express.Router()

const CLAIMS_ACCESS_IDS = [1]

professionalsClaimsRouter.get('/claim_request_pending/:skip/:limit', asyncRoute('Claim requests pending list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, CLAIMS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getPendingList(req.params.skip as string, req.params.limit as string, req.query.search as string))
}))

professionalsClaimsRouter.get('/claim_request_approved/:skip/:limit', asyncRoute('Claim request approved list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, CLAIMS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getApprovedList(req.params.skip as string, req.params.limit as string, req.query.search as string))
}))

professionalsClaimsRouter.get('/claim_request_rejected/:skip/:limit', asyncRoute('Claim request rejected list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, CLAIMS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getRejectedList(req.params.skip as string, req.params.limit as string, req.query.search as string))
}))

professionalsClaimsRouter.post(
  '/reject_request/:request_row_id',
  writeEndpointRateLimiter,
  [check('rejected_reason').trim().not().isEmpty().withMessage('The Rejected reason field is required').isLength({ min: 4 }).withMessage('The Rejected reason field must be at least 4 characters.')],
  asyncRoute('Reject user claim request.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, CLAIMS_ACCESS_IDS)

    let requestRowId = 0
    if (Number.isNaN(Number.parseInt(req.params.request_row_id as string))) {
      errObj['request_row_id'] = 'The Request row id field must be contain valid number.'
    } else {
      requestRowId = Number.parseInt(req.params.request_row_id as string)
    }

    res.json(await rejectRequest(auth, requestRowId, req.body.rejected_reason, errObj))
  }),
)

professionalsClaimsRouter.get(
  '/reject_claim/:request_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Reject claim.', async (req: Request, res: Response) => {
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, CLAIMS_ACCESS_IDS)
    if (!auth.status) return res.json(auth)
    res.json(await rejectClaim(auth, Number.parseInt(req.params.request_row_id as string)))
  }),
)

professionalsClaimsRouter.get(
  '/accept_claim/:request_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Accept claim.', async (req: Request, res: Response) => {
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, CLAIMS_ACCESS_IDS)
    if (!auth.status) return res.json(auth)
    res.json(await acceptClaim(auth, Number.parseInt(req.params.request_row_id as string)))
  }),
)

professionalsClaimsRouter.get(
  '/delete_claim/:request_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Delete claim.', async (req: Request, res: Response) => {
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, CLAIMS_ACCESS_IDS)
    if (!auth.status) return res.json(auth)
    res.json(await deleteClaim(auth, Number.parseInt(req.params.request_row_id as string)))
  }),
)

professionalsClaimsRouter.get('/view_claim/:request_row_id', asyncRoute('View claim.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, CLAIMS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await viewClaim(auth, Number.parseInt(req.params.request_row_id as string)))
}))
