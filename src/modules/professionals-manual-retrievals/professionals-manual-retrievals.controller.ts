// modules/professionals-manual-retrievals/professionals-manual-retrievals.controller.ts
//
// Phase C of the Professionals migration (see plan doc). Ports
// controllers/admin_panel/app/user/manual_users.js's 8 routes into a dedicated module.
//
// Mounted at a temporary `_v2` prefix (routes/admin_panel.js: '/manual_retrievals_v2') parallel
// to the untouched legacy '/manual_users' mount — legacy stays live and unmodified until this
// module is verified via real frontend testing.
//
// NOT PORTED (dead code, confirmed not used elsewhere): legacy attached its 4 pipeline-builder
// functions as properties on the Express router object itself (`router.buildPendingListInfoWorkPipeline
// = ...`) — an unusual pattern with zero references anywhere else in the repo (grepped). This
// module exports the consolidated builder as a normal function instead.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  getPendingList, getRejectedList, getApprovedList, getIndividualDetail,
  rejectManualUser, getSpeakersAttendeesEventsList, revokeManualUser, deleteManualUser,
} from './professionals-manual-retrievals.service'
import { AdminAuthResult } from './professionals-manual-retrievals.types'

export const professionalsManualRetrievalsRouter: Router = express.Router()

const MANUAL_RETRIEVALS_ACCESS_IDS = [1]

professionalsManualRetrievalsRouter.get('/pending_list/:skip/:limit', asyncRoute('Manual users pending list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MANUAL_RETRIEVALS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getPendingList({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string, search: req.query.search as string }))
}))

professionalsManualRetrievalsRouter.get('/rejected_ist/:skip/:limit', asyncRoute('Manual user rejected list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MANUAL_RETRIEVALS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getRejectedList({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string, search: req.query.search as string, rejectTypeRaw: req.query.reject_type as string }))
}))

professionalsManualRetrievalsRouter.get('/approved_list/:skip/:limit', asyncRoute('Manual user approved list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MANUAL_RETRIEVALS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)
  res.json(await getApprovedList({ skipRaw: req.params.skip as string, limitRaw: req.params.limit as string, search: req.query.search as string }))
}))

professionalsManualRetrievalsRouter.get('/individual_detail/:user_row_id', asyncRoute('Manual user individual details.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MANUAL_RETRIEVALS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)

  const userRowId = Number.parseInt(req.params.user_row_id as string)
  if (Number.isNaN(userRowId)) {
    return res.json({ status: false, message: { user_row_id: 'The User row id field must be contain valid number.' } })
  }
  res.json(await getIndividualDetail(userRowId))
}))

professionalsManualRetrievalsRouter.post(
  '/reject_manual_user/:user_row_id',
  writeEndpointRateLimiter,
  [check('rejected_reason').trim().not().isEmpty().withMessage('The User reject reason field required.').isLength({ min: 4 }).withMessage('The User reject reason field at least contain 5 characters in length.')],
  asyncRoute('Reject Manual user.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MANUAL_RETRIEVALS_ACCESS_IDS)
    if (!auth.status) return res.json(auth)

    const userRowId = Number.parseInt(req.params.user_row_id as string)
    res.json(await rejectManualUser(auth.message as any, userRowId, req.body.reject_type, req.body.rejected_reason, errObj))
  }),
)

professionalsManualRetrievalsRouter.get('/speakers_attendees_events_list/:user_row_id/:skip/:limit', asyncRoute('Manual user speaker and attendee events list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MANUAL_RETRIEVALS_ACCESS_IDS)
  if (!auth.status) return res.json(auth)

  const errObj: Record<string, string> = {}
  if (Number.isNaN(Number.parseInt(req.params.user_row_id as string))) errObj['user_row_id'] = 'The User row id field must be contain valid number.'
  if (Number.isNaN(Number.parseInt(req.params.skip as string))) errObj['skip'] = 'The parameter skip field must be contain valid number.'
  if (Number.isNaN(Number.parseInt(req.params.limit as string))) errObj['limit'] = 'The parameter limit field must be contain valid number.'
  if (Object.keys(errObj).length) return res.json({ status: false, message: errObj })

  const userRowId = Number.parseInt(req.params.user_row_id as string)
  const skip = Number.parseInt(req.params.skip as string)
  const limit = Number.parseInt(req.params.limit as string)
  const type = req.query.type !== undefined ? Number.parseInt(req.query.type as string) : undefined
  res.json(await getSpeakersAttendeesEventsList(userRowId, skip, limit, req.query.search as string, type))
}))

professionalsManualRetrievalsRouter.get(
  '/revoke_manual_user/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Revoke Manual user.', async (req: Request, res: Response) => {
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MANUAL_RETRIEVALS_ACCESS_IDS)
    if (!auth.status) return res.json(auth)
    res.json(await revokeManualUser(auth.message as any, Number.parseInt(req.params.user_row_id as string)))
  }),
)

professionalsManualRetrievalsRouter.get(
  '/delete_manual_user/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Delete Manual user.', async (req: Request, res: Response) => {
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MANUAL_RETRIEVALS_ACCESS_IDS)
    if (!auth.status) return res.json(auth)
    res.json(await deleteManualUser(auth.message as any, Number.parseInt(req.params.user_row_id as string)))
  }),
)
