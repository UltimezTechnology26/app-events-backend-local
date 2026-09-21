// modules/professionals-meetings/professionals-meetings.admin.controller.ts
// Ports admin_panel/app/meetings/meetings.js. Mounted at a `_v2` suffix parallel to the untouched
// legacy admin meetings mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getJournalistInterviewList, getJournalistOverview, getAdminMeetingsList, updateAdminMeetingStatus } from './professionals-meetings.admin.service'
import { AdminAuthResult } from './professionals-meetings.admin.types'

export const professionalsMeetingsAdminRouter: Router = express.Router()

const MEETINGS_ACCESS_IDS = [13]

professionalsMeetingsAdminRouter.get('/journalist_interview/:skip/:limit', asyncRoute('Journalist interview list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MEETINGS_ACCESS_IDS)
  res.json(await getJournalistInterviewList(auth, req.params.skip as string, req.params.limit as string, req.query as any))
}))

professionalsMeetingsAdminRouter.get('/journalist_overview', asyncRoute('Journalist interview overview.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MEETINGS_ACCESS_IDS)
  res.json(await getJournalistOverview(auth))
}))

professionalsMeetingsAdminRouter.get('/list/:skip/:limit', asyncRoute('Admin meetings list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MEETINGS_ACCESS_IDS)
  res.json(await getAdminMeetingsList(auth, req.params.skip as string, req.params.limit as string, req.query as any))
}))

professionalsMeetingsAdminRouter.post(
  '/status/:meeting_id',
  writeEndpointRateLimiter,
  [check('status').trim().isIn(['scheduled', 'rejected', 'rescheduled']).withMessage('Invalid meeting status.')],
  asyncRoute('Update admin meeting status.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AdminAuthResult = checkAdminLoginToken(req.headers, MEETINGS_ACCESS_IDS)
    res.json(await updateAdminMeetingStatus(auth, req.params.meeting_id as string, req.body, errObj))
  }),
)
