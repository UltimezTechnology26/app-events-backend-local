// modules/events/events.app.controller.ts
//
// Ports controllers/app/events/events_listed.js's POST /submit_event (1652). Deliberately a
// SEPARATE router from events.controller.ts's eventsRouter: that router is gated entirely by
// requireAdminAccess (admin-only), but /submit_event is used by BOTH self-service app users and
// admins (checkAllLoginToken, not checkAdminLoginToken) — admin-coinpedia's own "Create New" page
// proxies to this exact upstream route (pages/api/events-manage/manage/add_event.js ->
// app/event/submit_event), so it cannot sit behind an admin-only router-level guard. Mounted at a
// temporary `/event_v2` prefix under the `/app` mount (routes/app.js), parallel to the untouched
// legacy `/event` mount there.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { submitEvent } from './events.submit.service'

export const eventsAppRouter: Router = express.Router()

eventsAppRouter.post(
  '/submit_event',
  writeEndpointRateLimiter,
  [
    check('event_title').not().isEmpty().withMessage('The Event Title field is required').isLength({ min: 4 }).withMessage('The Event Title field must be at least 4 characters in length.'),
    check('event_tags').not().isEmpty().withMessage('The Event Tags field is required'),
    check('event_type').not().isEmpty().withMessage('The Event Type field is required'),
    check('event_link').not().isEmpty().withMessage('The Event Link field is required').isLength({ min: 4 }).withMessage('The Event Link field must be at least 4 characters in length.'),
    check('start_date').not().isEmpty().withMessage('The Start Date field is required'),
    check('end_date').not().isEmpty().withMessage('The End Date field is required'),
    check('event_description').not().isEmpty().withMessage('The Event Description field is required').isLength({ min: 4 }).withMessage('The Event Description field must be at least 4 characters in length.'),
    check('list_event_type').not().isEmpty().withMessage('The List Event Type field is required').isInt({ min: 1, max: 3 }).withMessage('The List Event Type field must be contain 1, 2 or 3.'),
    check('utc_row_id').not().isEmpty().withMessage('The UTC Time field is required'),
  ],
  asyncRoute('Submit event.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkUserToken = await checkAllLoginToken(req.headers, [10])
    if (!checkUserToken.status) {
      return res.json(checkUserToken)
    }
    // Matches legacy exactly: express-validator errors and business-logic errors accumulate into
    // the SAME errObj (business logic still runs even if express-validator already failed) before
    // a single combined check at the very end — not an early return on express-validator alone.
    res.json(await submitEvent(req.body, checkUserToken, errObj))
  })
)
