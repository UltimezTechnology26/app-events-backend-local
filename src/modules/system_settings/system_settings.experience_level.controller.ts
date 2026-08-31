// modules/system_settings/system_settings.experience_level.controller.ts
//
// Ports controllers/admin_panel/category_tags/experience_level.js's 6 routes
// (GET /list, POST /save, POST /update/:request_row_id, GET /enable/:request_row_id,
// GET /disable/:request_row_id, GET /delete/:request_row_id). Role array `[0]`
// confirmed verbatim from every `checkAdminLoginToken(req.headers, [0])` call in
// the legacy file. Mounted with no extra path prefix onto systemSettingsRouter
// (system_settings.controller.ts), which already applies requireAdminAccess([0])
// before any of these routes run — no need to re-apply it here.
import express, { Router } from 'express'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import {
  listExperienceLevels,
  saveExperienceLevel,
  updateExperienceLevel,
} from './system_settings.experience_level.service'
import {
  enableExperienceLevel,
  disableExperienceLevel,
  deleteExperienceLevel,
} from './system_settings.experience_level.status.service'

export const experienceLevelRouter: Router = express.Router()

experienceLevelRouter.get('/experience_level/list', asyncRoute('Experience level list.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const skip = Number.parseInt(req.query.skip as string) || 0
  const limit = Number.parseInt(req.query.limit as string) || 100000
  const result = await listExperienceLevels({
    actor,
    search: req.query.search as string | undefined,
    skip,
    limit,
  })
  return res.json(result)
}))

experienceLevelRouter.post('/experience_level/save', writeEndpointRateLimiter, asyncRoute('Save Experience level details.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const result = await saveExperienceLevel({ actor, input: req.body })
  return res.json(result)
}))

experienceLevelRouter.post('/experience_level/update/:request_row_id', writeEndpointRateLimiter, asyncRoute('Update Experience level details.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const requestRowId = Number.parseInt(req.params.request_row_id as string)
  const result = await updateExperienceLevel({ actor, requestRowId, input: req.body })
  return res.json(result)
}))

experienceLevelRouter.get('/experience_level/enable/:request_row_id', writeEndpointRateLimiter, asyncRoute('Enable Experience level.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const requestRowId = Number.parseInt(req.params.request_row_id as string)
  const result = await enableExperienceLevel({ actor, requestRowId })
  return res.json(result)
}))

experienceLevelRouter.get('/experience_level/disable/:request_row_id', writeEndpointRateLimiter, asyncRoute('Disable Experience level.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const requestRowId = Number.parseInt(req.params.request_row_id as string)
  const result = await disableExperienceLevel({ actor, requestRowId })
  return res.json(result)
}))

experienceLevelRouter.get('/experience_level/delete/:request_row_id', writeEndpointRateLimiter, asyncRoute('Delete Experience level.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const requestRowId = Number.parseInt(req.params.request_row_id as string)
  const result = await deleteExperienceLevel({ actor, requestRowId })
  return res.json(result)
}))
