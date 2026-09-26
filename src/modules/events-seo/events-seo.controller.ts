// modules/events-seo/events-seo.controller.ts
//
// Ports controllers/admin_panel/events/event.js's GET /seo_overview (13052).
//
// REAL BEHAVIOR CHANGE (flagged, not silent): the legacy route had NO checkAdminLoginToken call
// at all — only the global checkApiKey gate — same class of gap this repo's own
// professionals.controller.ts already closed for its /overview route (see that file's own
// comment). Gated with EVENTS_ACCESS_IDS here, closing the gap rather than porting it forward.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getSeoOverview } from './events-seo.service'

export const eventsSeoRouter: Router = express.Router()

const EVENTS_ACCESS_IDS = [10]
eventsSeoRouter.use(requireAdminAccess(EVENTS_ACCESS_IDS))

eventsSeoRouter.get(
  '/seo_overview',
  asyncRoute('SEO Overview Error.', async (req: Request, res: Response) => {
    const checkAdminToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkAdminToken.status) return res.json(checkAdminToken)
    res.json(await getSeoOverview())
  })
)
