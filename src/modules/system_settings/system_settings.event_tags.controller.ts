// modules/system_settings/system_settings.event_tags.controller.ts
//
// Ports controllers/admin_panel/category_tags/event_tags.js's 6 routes
// (GET /list, POST /save, POST /update/:request_row_id, GET
// /enable/:request_row_id, GET /disable/:request_row_id, GET
// /delete/:request_row_id). Role array `[0]` confirmed verbatim from every
// `checkAdminLoginToken(req.headers, [0])` call in the legacy file. FIX #1
// is structurally enforced here: every handler's only response calls are
// the single `return res.json(...)` in the try block and the single
// `return res.json(...)` in the catch block — there is no code path in any
// handler where a `res.json` call is not immediately followed by function
// exit, so a validation error response can never be followed by further
// mutating work the way the legacy code's missing `return` allowed. Mounted
// with no extra path prefix onto systemSettingsRouter, which already
// applies requireAdminAccess([0]) before any of these routes run.
import express, { Router } from 'express'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { listEventTags, saveEventTag, updateEventTag } from './system_settings.event_tags.service'
import { enableEventTag, disableEventTag, deleteEventTag } from './system_settings.event_tags.status.service'

export const eventTagsRouter: Router = express.Router()

eventTagsRouter.get('/event_tags/list', asyncRoute('Event tags list error:', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const skip = Number.parseInt(req.query.skip as string) || 0
  const limit = Number.parseInt(req.query.limit as string) || 100000
  const result = await listEventTags({
    actor,
    search: req.query.search as string | undefined,
    activeStatus: req.query.active_status as string | undefined,
    skip,
    limit,
  })
  return res.json(result)
}))

eventTagsRouter.post('/event_tags/save', writeEndpointRateLimiter, asyncRoute('Save event tag details.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const result = await saveEventTag({ actor, input: req.body })
  return res.json(result)
}))

eventTagsRouter.post('/event_tags/update/:request_row_id', writeEndpointRateLimiter, asyncRoute('Update Event tag details.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const requestRowId = Number.parseInt(req.params.request_row_id as string)
  const result = await updateEventTag({ actor, requestRowId, input: req.body })
  return res.json(result)
}))

eventTagsRouter.get('/event_tags/enable/:request_row_id', writeEndpointRateLimiter, asyncRoute('Enable Event tag.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const requestRowId = Number.parseInt(req.params.request_row_id as string)
  const result = await enableEventTag({ actor, requestRowId })
  return res.json(result)
}))

eventTagsRouter.get('/event_tags/disable/:request_row_id', writeEndpointRateLimiter, asyncRoute('Disable Event tag.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const requestRowId = Number.parseInt(req.params.request_row_id as string)
  const result = await disableEventTag({ actor, requestRowId })
  return res.json(result)
}))

eventTagsRouter.get('/event_tags/delete/:request_row_id', writeEndpointRateLimiter, asyncRoute('Delete Event tag.', async (req, res) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  const requestRowId = Number.parseInt(req.params.request_row_id as string)
  const result = await deleteEventTag({ actor, requestRowId })
  return res.json(result)
}))
