// modules/professionals-approvals/professionals-approvals.controller.ts
//
// Phase D of the Professionals migration (see plan doc). Ports
// controllers/admin_panel/app/user_approvals.js's 3 routes (self-registration approvals:
// list/approve/reject) into a dedicated module.
//
// Mounted at a temporary `_v2` prefix (routes/admin_panel.js: '/users_approvals_v2') parallel to
// the untouched legacy '/users_approvals' mount.
//
// NOT PORTED (confirmed dead code, same pattern as Phase C's manual_users.js): legacy attached
// its pipeline-builder function as a property on the router object itself
// (`router.buildPendingListInfoWorkPipeline = ...`) — grepped, zero other references anywhere.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getApprovalsList, approveRequest, rejectRequest } from './professionals-approvals.service'
import { AdminAuthResult } from './professionals-approvals.types'

export const professionalsApprovalsRouter: Router = express.Router()

const APPROVALS_ACCESS_IDS = [1]

professionalsApprovalsRouter.get('/list/:approval_status/:login_status/:skip/:limit', asyncRoute('Users list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, APPROVALS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)

  res.json(await getApprovalsList({
    approvalStatus: Number.parseInt(req.params.approval_status as string),
    loginStatus: Number.parseInt(req.params.login_status as string),
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string,
    claimStatusRaw: req.query.claim_status as string,
    subAdminRowIdRaw: req.query.sub_admin_row_id as string,
    profileScoreRange: req.query.profile_score as string,
    designationStatusRaw: req.query.designation_status as string,
    lookingForStatusRaw: req.query.looking_for_status as string,
  }))
}))

professionalsApprovalsRouter.get(
  '/approve_request/:request_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Approve user request.', async (req: Request, res: Response) => {
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, APPROVALS_ACCESS_IDS)
    if (!auth.status) return res.json(auth)
    res.json(await approveRequest(auth, Number.parseInt(req.params.request_row_id as string)))
  }),
)

professionalsApprovalsRouter.post(
  '/reject_request/:request_row_id',
  writeEndpointRateLimiter,
  [check('reason_rejected').trim().not().isEmpty().withMessage('The reason rejected field is required')],
  asyncRoute('Reject user request.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, APPROVALS_ACCESS_IDS)
    if (!auth.status) return res.json(auth)
    res.json(await rejectRequest(auth, Number.parseInt(req.params.request_row_id as string), req.body.reason_rejected, errObj))
  }),
)
