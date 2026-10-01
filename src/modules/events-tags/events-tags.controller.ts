// modules/events-tags/events-tags.controller.ts
//
// Ports controllers/app/events/events_listed.js's GET /events_tags (1461). Public-ish route
// (works with or without a user token — legacy has no auth gate on it at all beyond the global
// checkApiKey), so mounted alongside events.app.controller.ts's eventsAppRouter at the same
// '/event_v2' prefix under routes/app.js's '/app' mount, matching the legacy '/app/event' path.
import express, { Router, Request, Response } from 'express'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getEventsTags } from './events-tags.service'

export const eventsTagsRouter: Router = express.Router()

eventsTagsRouter.get(
  '/events_tags',
  asyncRoute('Event tags.', async (req: Request, res: Response) => {
    res.json(await getEventsTags(req.headers))
  })
)
