// modules/system_settings/system_settings.area_of_interests.controller.ts
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's 6
// routes verbatim, including their exact legacy path names/params (which
// differ from the generic `/save`/`/update/:id` shape used by Experience
// Level/Report Issues Options/Event Tags): GET /list, POST
// /save_n_add_user_looking, POST /update_looking/:looking_id, GET
// /enable_looking/:looking_id, GET /disable_looking/:looking_id, GET
// /delete_looking_for/:looking_id. Role array `[0]` confirmed verbatim from
// every `checkAdminLoginToken(req.headers, [0])` call in the legacy file.
// Mounted with no extra path prefix onto systemSettingsRouter, which
// already applies requireAdminAccess([0]) before any of these routes run.
import express, { Router } from 'express'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import {
  listAreasOfInterest,
  saveAreaOfInterest,
  updateAreaOfInterest,
} from './system_settings.area_of_interests.service'
import {
  enableAreaOfInterest,
  disableAreaOfInterest,
  deleteAreaOfInterest,
} from './system_settings.area_of_interests.status.service'

export const areaOfInterestsRouter: Router = express.Router()

areaOfInterestsRouter.get('/area_of_interests/list', asyncRoute('Looking-for-job list error:', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const skip = Number.parseInt(req.query.skip as string) || 0
  const limit = Number.parseInt(req.query.limit as string) || 100000
  const result = await listAreasOfInterest({
    actor,
    search: req.query.search as string | undefined,
    status: req.query.status as string | undefined,
    skip,
    limit,
  })
  return res.json(result)
}))

areaOfInterestsRouter.post(
  '/area_of_interests/save_n_add_user_looking',
  writeEndpointRateLimiter,
  asyncRoute('Add user looking for.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const result = await saveAreaOfInterest({ actor, input: req.body })
    return res.json(result)
  })
)

areaOfInterestsRouter.post(
  '/area_of_interests/update_looking/:looking_id',
  writeEndpointRateLimiter,
  asyncRoute('Update user looking for.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const requestRowId = Number.parseInt(req.params.looking_id as string)
    const result = await updateAreaOfInterest({ actor, requestRowId, input: req.body })
    return res.json(result)
  })
)

areaOfInterestsRouter.get(
  '/area_of_interests/enable_looking/:looking_id',
  writeEndpointRateLimiter,
  asyncRoute('Enable user looking for.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const requestRowId = Number.parseInt(req.params.looking_id as string)
    const result = await enableAreaOfInterest({ actor, requestRowId })
    return res.json(result)
  })
)

areaOfInterestsRouter.get(
  '/area_of_interests/disable_looking/:looking_id',
  writeEndpointRateLimiter,
  asyncRoute('Disable user looking for.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const requestRowId = Number.parseInt(req.params.looking_id as string)
    const result = await disableAreaOfInterest({ actor, requestRowId })
    return res.json(result)
  })
)

areaOfInterestsRouter.get(
  '/area_of_interests/delete_looking_for/:looking_id',
  writeEndpointRateLimiter,
  asyncRoute('Delete user looking for.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const requestRowId = Number.parseInt(req.params.looking_id as string)
    const result = await deleteAreaOfInterest({ actor, requestRowId })
    return res.json(result)
  })
)
