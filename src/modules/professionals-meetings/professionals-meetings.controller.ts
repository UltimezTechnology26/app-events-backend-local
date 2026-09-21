// modules/professionals-meetings/professionals-meetings.controller.ts
// Ports controllers/app/meetings/meeting.js. Mounted at a `_v2` suffix parallel to the untouched
// legacy meetings mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  scheduleJobInterview, schedule1on1Meeting, scheduleJournalistInterview, scheduleBusinessMeeting,
  getMeetingsListResponse, updateMeetingStatus,
} from './professionals-meetings.service'
import { AllAuthResult } from './professionals-meetings.types'

export const professionalsMeetingsRouter: Router = express.Router()

professionalsMeetingsRouter.post(
  '/schedule_job_interview/:applicant_id',
  writeEndpointRateLimiter,
  [
    check('job_role').trim().not().isEmpty().withMessage('Job Role is required.'),
    check('company_row_id').customSanitizer((val: unknown) => String(val)).trim().not().isEmpty().withMessage('Company row id is required.').isInt({ min: 1 }).withMessage('Company row id must be a valid number.'),
    check('meeting_datetime').not().isEmpty().withMessage('Meeting datetime is required.'),
    check('meeting_timezone').not().isEmpty().withMessage('Meeting timezone is required.'),
    check('meeting_link').trim().not().isEmpty().withMessage('Meeting link is required.'),
    check('upload_document').optional().isString().withMessage('Upload document must be a string.'),
  ],
  asyncRoute('Schedule job interview.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
    res.json(await scheduleJobInterview(auth, req.params.applicant_id as string, req.body, req.query.user_row_id, errObj))
  }),
)

professionalsMeetingsRouter.post(
  '/schedule_1on1_meeting',
  writeEndpointRateLimiter,
  [
    check('meeting_datetime').not().isEmpty().withMessage('Meeting datetime is required.'),
    check('meeting_title').not().isEmpty().withMessage('Meeting Title is required.'),
    check('meeting_timezone').not().isEmpty().withMessage('Meeting timezone is required.'),
    check('meeting_link').trim().not().isEmpty().withMessage('Meeting link is required.'),
    check('professional_id').trim().not().isEmpty().withMessage('Professional Id is required.'),
  ],
  asyncRoute('Schedule 1on1 meeting.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
    res.json(await schedule1on1Meeting(auth, req.body, req.query.user_row_id, errObj))
  }),
)

professionalsMeetingsRouter.post(
  '/schedule_journalist_interview',
  writeEndpointRateLimiter,
  [
    check('meeting_datetime').not().isEmpty().withMessage('Meeting datetime is required.'),
    check('meeting_title').not().isEmpty().withMessage('Meeting Title is required.'),
    check('meeting_timezone').not().isEmpty().withMessage('Meeting timezone is required.'),
    check('meeting_link').trim().not().isEmpty().withMessage('Meeting link is required.'),
    check('upload_document').optional().isString().withMessage('Upload document must be a string.'),
  ],
  asyncRoute('Schedule journalist interview.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
    res.json(await scheduleJournalistInterview(auth, req.body, req.query.user_row_id, errObj))
  }),
)

professionalsMeetingsRouter.post(
  '/schedule_business_meeting',
  writeEndpointRateLimiter,
  [
    check('meeting_datetime').not().isEmpty().withMessage('Meeting datetime is required.'),
    check('meeting_title').not().isEmpty().withMessage('Meeting Title is required.'),
    check('meeting_timezone').not().isEmpty().withMessage('Meeting timezone is required.'),
    check('meeting_link').trim().not().isEmpty().withMessage('Meeting link is required.'),
  ],
  asyncRoute('Schedule business meeting.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
    res.json(await scheduleBusinessMeeting(auth, req.body, req.query.user_row_id, errObj))
  }),
)

professionalsMeetingsRouter.get('/list/:skip/:limit', asyncRoute('Meetings list.', async (req: Request, res: Response) => {
  const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
  res.json(await getMeetingsListResponse(auth, req, req.query.user_row_id, req.query.company_row_id))
}))

professionalsMeetingsRouter.post(
  '/status/:meeting_id',
  writeEndpointRateLimiter,
  [check('status').trim().isIn(['scheduled', 'rejected', 'rescheduled']).withMessage('Invalid meeting status.')],
  asyncRoute('Update meeting status.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: AllAuthResult = await checkAllLoginToken(req.headers, [13])
    res.json(await updateMeetingStatus(auth, req.params.meeting_id as string, req.body, errObj))
  }),
)
