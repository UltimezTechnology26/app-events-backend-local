// modules/events-organisers/events-organisers.controller.ts
//
// Ports controllers/admin_panel/events/event.js's GET /host_list (3506), GET /host_view (3681),
// GET /admin_organizers_list (3977), GET /admin_organizers_view (4105) — the "Organisers List"
// menu's Host/Claimed and Admin/Unclaimed pages. Mounted alongside the `events` module's
// eventsRouter at the same '/admin_panel/event_v2' prefix (same legacy '/admin_panel/event'
// mount these routes came from), parallel router, no path collision.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getHostList, getHostView, getAdminOrganizersList, getAdminOrganizersView, getOrganisersCount } from './events-organisers.service'

export const eventsOrganisersRouter: Router = express.Router()

const EVENTS_ACCESS_IDS = [10]
eventsOrganisersRouter.use(requireAdminAccess(EVENTS_ACCESS_IDS))

eventsOrganisersRouter.get(
  '/organisers_count',
  asyncRoute('Organisers count.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(await getOrganisersCount())
  })
)

eventsOrganisersRouter.get(
  '/host_list/:skip/:limit',
  asyncRoute('Hosts list.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(await getHostList(req.params.skip as string, req.params.limit as string, req.query.search as string | undefined))
  })
)

eventsOrganisersRouter.get(
  '/host_view/:user_row_id',
  asyncRoute('Host individual view.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(
      await getHostView(Number.parseInt(req.params.user_row_id as string), {
        search: req.query.search as string | undefined,
        listEventType: req.query.list_event_type as string | undefined,
        status: req.query.status as string | undefined,
        approvalStatus: req.query.approval_status as string | undefined,
      })
    )
  })
)

eventsOrganisersRouter.get(
  '/admin_organizers_list/:skip/:limit',
  asyncRoute('Admin organizers list.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(await getAdminOrganizersList(req.params.skip as string, req.params.limit as string, req.query.search as string | undefined))
  })
)

eventsOrganisersRouter.get(
  '/admin_organizers_view/:company_row_id',
  asyncRoute('Admin organizers individual view.', async (req: Request, res: Response) => {
    const checkToken = checkAdminLoginToken(req.headers, EVENTS_ACCESS_IDS)
    if (!checkToken.status) return res.json(checkToken)
    res.json(
      await getAdminOrganizersView(Number.parseInt(req.params.company_row_id as string), {
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        approvalStatus: req.query.approval_status as string | undefined,
      })
    )
  })
)
