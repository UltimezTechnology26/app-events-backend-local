// modules/events-speakers/events-speakers.controller.ts
//
// Ports controllers/admin_panel/events/event.js's GET /speakers_list (10876),
// GET /speaker_basic_details/:user_type/:user_row_id (11297), GET /speaker_events (11418),
// GET /speakers_overview (11692). Mounted alongside the `events` module's eventsRouter at the
// same '/admin_panel/event_v2' prefix.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getSpeakersList, getSpeakerBasicDetails, getSpeakerEvents, getSpeakersOverview } from './events-speakers.service'

export const eventsSpeakersRouter: Router = express.Router()

const EVENTS_ACCESS_IDS = [10]
eventsSpeakersRouter.use(requireAdminAccess(EVENTS_ACCESS_IDS))

eventsSpeakersRouter.get(
  '/speakers_list/:skip/:limit',
  asyncRoute('Speakers list.', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) return res.json(checkAdminToken)
    res.json(await getSpeakersList(req.params.skip as string, req.params.limit as string, req.query.search as string | undefined, req.query.user_type as string | undefined, req.query.active_type as string | undefined))
  })
)

eventsSpeakersRouter.get(
  '/speaker_basic_details/:user_type/:user_row_id',
  asyncRoute('Speaker basic details.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(await getSpeakerBasicDetails(req.params.user_type as string, req.params.user_row_id as string))
  })
)

eventsSpeakersRouter.get(
  '/speaker_events/:user_type/:user_row_id',
  asyncRoute("Speaker's events list", async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(await getSpeakerEvents(req.params.user_type as string, req.params.user_row_id as string, req.query.search as string | undefined, req.query.status as string | undefined))
  })
)

eventsSpeakersRouter.get(
  '/speakers_overview',
  asyncRoute('Speakers Overview.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(await getSpeakersOverview())
  })
)
