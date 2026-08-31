// modules/system_settings/system_settings.user_expertise.controller.ts
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's 6 routes
// verbatim, including their exact legacy path names/params: GET /list,
// POST /save_n_add_position, POST /update_position/:designation_id, GET
// /enable_position/:designation_id, GET /disable_position/:designation_id,
// GET /delete_position/:designation_id. Role array `[0]` confirmed
// verbatim from every `checkAdminLoginToken(req.headers, [0])` call in the
// legacy file. Mounted with no extra path prefix onto systemSettingsRouter,
// which already applies requireAdminAccess([0]) before any of these routes
// run.
import express, { Router } from 'express'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import {
  listUserExpertise,
  saveUserExpertise,
  updateUserExpertise,
} from './system_settings.user_expertise.service'
import {
  enableUserExpertise,
  disableUserExpertise,
  deleteUserExpertise,
} from './system_settings.user_expertise.status.service'

export const userExpertiseRouter: Router = express.Router()

userExpertiseRouter.get('/user_expertise/list', asyncRoute('User designation list error:', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const skip = Number.parseInt(req.query.skip as string) || 0
  const limit = Number.parseInt(req.query.limit as string) || 100000
  const result = await listUserExpertise({
    actor,
    search: req.query.search as string | undefined,
    status: req.query.status as string | undefined,
    skip,
    limit,
  })
  return res.json(result)
}))

userExpertiseRouter.post(
  '/user_expertise/save_n_add_position',
  writeEndpointRateLimiter,
  asyncRoute('Save User expertise.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const result = await saveUserExpertise({ actor, input: req.body })
    return res.json(result)
  })
)

userExpertiseRouter.post(
  '/user_expertise/update_position/:designation_id',
  writeEndpointRateLimiter,
  asyncRoute('Update User expertise.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const requestRowId = Number.parseInt(req.params.designation_id as string)
    const result = await updateUserExpertise({ actor, requestRowId, input: req.body })
    return res.json(result)
  })
)

userExpertiseRouter.get(
  '/user_expertise/enable_position/:designation_id',
  writeEndpointRateLimiter,
  asyncRoute('Enable User expertise.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const requestRowId = Number.parseInt(req.params.designation_id as string)
    const result = await enableUserExpertise({ actor, requestRowId })
    return res.json(result)
  })
)

userExpertiseRouter.get(
  '/user_expertise/disable_position/:designation_id',
  writeEndpointRateLimiter,
  asyncRoute('Disable User expertise.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const requestRowId = Number.parseInt(req.params.designation_id as string)
    const result = await disableUserExpertise({ actor, requestRowId })
    return res.json(result)
  })
)

userExpertiseRouter.get(
  '/user_expertise/delete_position/:designation_id',
  writeEndpointRateLimiter,
  asyncRoute('Delete User expertise.', async (req, res) => {
    const actor = checkAdminLoginToken(req.headers, [0])
    const requestRowId = Number.parseInt(req.params.designation_id as string)
    const result = await deleteUserExpertise({ actor, requestRowId })
    return res.json(result)
  })
)
