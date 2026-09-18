// modules/work-experience/work-experience.positions.controller.ts
//
// Ports controllers/admin_panel/category_tags/positions.js's 5 routes
// (GET /list, POST /update_position_details, GET /enable_position/:id,
// GET /disable_position/:id, GET /delete_position/:id) verbatim, following
// the repo's established `actor`-pattern convention (see
// modules/system_settings/system_settings.controller.ts): `checkAdminLoginToken`
// is resolved into `actor` OUTSIDE the try block, then passed into the
// service; the service checks `actor.status` and returns the actor object
// unchanged on failure, which this controller just forwards as-is. Role
// array `[0]` confirmed verbatim from every `checkAdminLoginToken(req.headers, [0])`
// call in the legacy file. Mounted (routes/admin_panel.js) at a temporary
// parallel prefix, `/positions_v2`, distinct from the legacy `/positions` mount.

import express, { Router } from 'express'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { listPositions, savePosition } from './work-experience.positions.service'
import { enablePosition, disablePosition, deletePosition } from './work-experience.positions.status.service'

export const positionsRouter: Router = express.Router()
positionsRouter.use(requireAdminAccess([0]))

positionsRouter.get('/list', asyncRoute('Work positions list error:', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const skip = Number.parseInt(req.query.skip as string) || 0
  const limit = Number.parseInt(req.query.limit as string) || 100000
  const result = await listPositions({
    actor,
    search: req.query.search as string | undefined,
    activeStatus: req.query.active_status as string | undefined,
    skip,
    limit,
  })
  return res.json(result)
}))

positionsRouter.post('/update_position_details', writeEndpointRateLimiter, asyncRoute('Update User positions.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const result = await savePosition({ actor, input: req.body })
  return res.json(result)
}))

positionsRouter.get('/enable_position/:position_row_id', writeEndpointRateLimiter, asyncRoute('Enable User positions.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const positionRowId = Number.parseInt(req.params.position_row_id as string)
  const result = await enablePosition({ actor, positionRowId })
  return res.json(result)
}))

positionsRouter.get('/disable_position/:position_row_id', writeEndpointRateLimiter, asyncRoute('Disable User positions.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const positionRowId = Number.parseInt(req.params.position_row_id as string)
  const result = await disablePosition({ actor, positionRowId })
  return res.json(result)
}))

positionsRouter.get('/delete_position/:position_row_id', writeEndpointRateLimiter, asyncRoute('Delete User positions.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const positionRowId = Number.parseInt(req.params.position_row_id as string)
  const result = await deletePosition({ actor, positionRowId })
  return res.json(result)
}))
