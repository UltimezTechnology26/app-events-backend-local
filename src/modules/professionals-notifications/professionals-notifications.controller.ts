// modules/professionals-notifications/professionals-notifications.controller.ts
// Ports admin_panel/app/notifications.js. Mounted at a `_v2` suffix parallel to the untouched
// legacy admin notifications mount.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getNotificationsList, getNotificationsInfo, updateViewedStatus } from './professionals-notifications.service'
import { AdminAuthResult } from './professionals-notifications.types'

export const professionalsNotificationsRouter: Router = express.Router()

professionalsNotificationsRouter.get('/list/:skip/:limit', asyncRoute('Notification list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [-1])
  res.json(await getNotificationsList(auth, req.params.skip as string, req.params.limit as string))
}))

professionalsNotificationsRouter.get('/info', asyncRoute('Notification messages list.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [-1])
  res.json(await getNotificationsInfo(auth))
}))

professionalsNotificationsRouter.get('/update_viewed_status', writeEndpointRateLimiter, asyncRoute('Update viewed status.', async (req: Request, res: Response) => {
  const auth: AdminAuthResult = checkAdminLoginToken(req.headers, [-1])
  res.json(await updateViewedStatus(auth))
}))
