// modules/events-overview/events-overview.controller.ts
//
// Ports the operational-stats sections of controllers/admin_panel/events/event.js's Events
// Overview dashboard (GET /overview_details, GET /other_details, the organizer-tag slice of GET
// /tags_data, and /overview's employees_events_reports) into ONE consolidated route. Mounted
// alongside the `events` module's eventsRouter at the same '/admin_panel/event_v2' prefix.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getEventsOverview } from './events-overview.service'

export const eventsOverviewRouter: Router = express.Router()

const EVENTS_ACCESS_IDS = [10]
eventsOverviewRouter.use(requireAdminAccess(EVENTS_ACCESS_IDS))

eventsOverviewRouter.get(
  '/overview',
  asyncRoute('Events overview.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(await getEventsOverview(req.query.filter as string | undefined))
  })
)
