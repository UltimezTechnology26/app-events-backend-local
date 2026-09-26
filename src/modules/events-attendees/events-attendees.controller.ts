// modules/events-attendees/events-attendees.controller.ts
//
// Ports controllers/events/attendees.js's GET /all_list/:skip/:limit (2815) and
// GET /attendees_count (2854) — the "Attendees List" admin menu page. Mounted at a temporary
// '/attendees_v2' prefix under routes/events.js's '/events' mount, parallel to the untouched
// legacy '/attendees' mount there (this controller lives in a genuinely different legacy file,
// controllers/events/attendees.js, mounted under the top-level '/events' router, not
// '/admin_panel/event' like the rest of the Events admin routes).
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getAttendeesList, getAttendeesCount } from './events-attendees.service'

export const eventsAttendeesRouter: Router = express.Router()

const EVENTS_ACCESS_IDS = [10]
eventsAttendeesRouter.use(requireAdminAccess(EVENTS_ACCESS_IDS))

eventsAttendeesRouter.get(
  '/all_list/:skip/:limit',
  asyncRoute('All attendees list.', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) return res.json(checkAdminToken)

    const errObj: Record<string, string> = {}
    if (Number.isNaN(Number.parseInt(req.params.skip as string))) errObj['skip'] = 'The parameter skip field must be contain valid number'
    if (Number.isNaN(Number.parseInt(req.params.limit as string))) errObj['limit'] = 'The parameter limit field must be contain valid number.'
    if (Object.keys(errObj).length) {
      return res.json({ status: false, message: errObj })
    }

    const skip = Number.parseInt(req.params.skip as string)
    const limit = Number.parseInt(req.params.limit as string)
    res.json(await getAttendeesList(req, skip, limit))
  })
)

eventsAttendeesRouter.get(
  '/attendees_count',
  asyncRoute('All attendees list.', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) return res.json(checkAdminToken)
    res.json(await getAttendeesCount(req.query.status as string | undefined))
  })
)
