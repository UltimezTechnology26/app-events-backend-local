// modules/events-location/events-location.controller.ts
//
// Ports controllers/admin_panel/events/event.js's GET /searched_locations (12677) — the
// "Location List" admin menu page. Mounted alongside the `events` module's eventsRouter at the
// same '/admin_panel/event_v2' prefix.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getSearchedLocations } from './events-location.service'
import { getLocationDetail } from './events-location-detail.service'

export const eventsLocationRouter: Router = express.Router()

const EVENTS_ACCESS_IDS = [10]
eventsLocationRouter.use(requireAdminAccess(EVENTS_ACCESS_IDS))

eventsLocationRouter.get(
  '/searched_locations/:skip/:limit',
  asyncRoute('Searched locations list.', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) return res.json(checkAdminToken)
    res.json(await getSearchedLocations(req.params.skip as string, req.params.limit as string, req.query.search as string | undefined))
  })
)

eventsLocationRouter.get(
  '/searched_users_list/:type/:location_row_id/:skip/:limit',
  asyncRoute('Location detail (registered users / created events).', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) return res.json(checkAdminToken)
    res.json(
      await getLocationDetail({
        typeRaw: req.params.type as string,
        locationRowIdRaw: req.params.location_row_id as string,
        skipRaw: req.params.skip as string,
        limitRaw: req.params.limit as string,
        dateRangeRaw: req.query.date_range as string | undefined,
        startDate: req.query.start_date as string | undefined,
        endDate: req.query.end_date as string | undefined,
      })
    )
  })
)
