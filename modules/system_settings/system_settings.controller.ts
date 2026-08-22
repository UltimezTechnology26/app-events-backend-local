// modules/system_settings/system_settings.controller.ts
//
// Single router (`systemSettingsRouter`) carrying ALL 5 system-settings
// categories per the user's explicit decision to not split this module by
// subfeature. Task 1 mounts only the experience_level routes; Tasks 2-5 add
// more routes to this SAME router object under their own `/<category>/...`
// sub-paths, so categories never collide on path even though they share one
// router. Mounted (routes/admin_panel.js) at a temporary parallel prefix,
// `/system_settings_v2`, distinct from every legacy category prefix.
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../middleware/authorization')
import {
  listExperienceLevels,
  saveExperienceLevel,
  updateExperienceLevel,
  enableExperienceLevel,
  disableExperienceLevel,
  deleteExperienceLevel,
  upsertReportIssuesOptions,
  listEventTags,
  saveEventTag,
  updateEventTag,
  enableEventTag,
  disableEventTag,
  deleteEventTag,
  listAreasOfInterest,
  saveAreaOfInterest,
  updateAreaOfInterest,
  enableAreaOfInterest,
  disableAreaOfInterest,
  deleteAreaOfInterest,
  listUserExpertise,
  saveUserExpertise,
  updateUserExpertise,
  enableUserExpertise,
  disableUserExpertise,
  deleteUserExpertise,
} from './system_settings.service'

export const systemSettingsRouter: Router = express.Router()

// ==== Experience Level ====
//
// Ports controllers/admin_panel/category_tags/experience_level.js's 6 routes
// (GET /list, POST /save, POST /update/:request_row_id, GET /enable/:request_row_id,
// GET /disable/:request_row_id, GET /delete/:request_row_id). Role array `[0]`
// confirmed verbatim from every `checkAdminLoginToken(req.headers, [0])` call in
// the legacy file.

systemSettingsRouter.get('/experience_level/list', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const skip = Number.parseInt(req.query.skip as string) || 0
    const limit = Number.parseInt(req.query.limit as string) || 100000
    const result = await listExperienceLevels({
      actor,
      search: req.query.search as string | undefined,
      skip,
      limit,
    })
    return res.json(result)
  } catch (err: any) {
    console.log('Experience level list.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.post('/experience_level/save', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const result = await saveExperienceLevel({ actor, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Save Experience level details.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.post('/experience_level/update/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    const result = await updateExperienceLevel({ actor, requestRowId, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Update Experience level details.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/experience_level/enable/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    const result = await enableExperienceLevel({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Enable Experience level.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/experience_level/disable/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    const result = await disableExperienceLevel({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Disable Experience level.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/experience_level/delete/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    const result = await deleteExperienceLevel({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Delete Experience level.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// ==== Report Issues Options ====
//
// Ports controllers/admin_panel/category_tags/report_issues_options.js's
// single route (POST /add_update). This legacy controller has no list/enable/
// disable/delete routes at all, so none are added here. Role array `[0]`
// confirmed verbatim from its one `checkAdminLoginToken(req.headers, [0])`
// call. `checkUserLoginToken` is imported by the legacy file but never
// called — confirmed dead import, intentionally not used here.

systemSettingsRouter.post('/report_issues_options/add_update', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const result = await upsertReportIssuesOptions({ actor, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Save/update report issue options', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// ==== Event Tags ====
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
// mutating work the way the legacy code's missing `return` allowed.

systemSettingsRouter.get('/event_tags/list', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
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
  } catch (err: any) {
    console.log('Event tags list error:', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.post('/event_tags/save', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const result = await saveEventTag({ actor, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Save event tag details.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.post('/event_tags/update/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    const result = await updateEventTag({ actor, requestRowId, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Update Event tag details.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/event_tags/enable/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    const result = await enableEventTag({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Enable Event tag.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/event_tags/disable/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    const result = await disableEventTag({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Disable Event tag.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/event_tags/delete/:request_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.request_row_id as string)
    const result = await deleteEventTag({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Delete Event tag.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// ==== Area of Interests ====
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's 6
// routes verbatim, including their exact legacy path names/params (which
// differ from the generic `/save`/`/update/:id` shape used by Tasks 1-3):
// GET /list, POST /save_n_add_user_looking, POST
// /update_looking/:looking_id, GET /enable_looking/:looking_id, GET
// /disable_looking/:looking_id, GET /delete_looking_for/:looking_id. Role
// array `[0]` confirmed verbatim from every `checkAdminLoginToken(req.headers,
// [0])` call in the legacy file. FIX #1 is structurally enforced the same
// way as the Event Tags routes above (single `res.json` per code path).

systemSettingsRouter.get('/area_of_interests/list', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
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
  } catch (err: any) {
    console.log('Looking-for-job list error:', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.post('/area_of_interests/save_n_add_user_looking', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const result = await saveAreaOfInterest({ actor, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Add user looking for.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.post('/area_of_interests/update_looking/:looking_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.looking_id as string)
    const result = await updateAreaOfInterest({ actor, requestRowId, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Update user looking for.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/area_of_interests/enable_looking/:looking_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.looking_id as string)
    const result = await enableAreaOfInterest({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Enable user looking for.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/area_of_interests/disable_looking/:looking_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.looking_id as string)
    const result = await disableAreaOfInterest({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Disable user looking for.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/area_of_interests/delete_looking_for/:looking_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.looking_id as string)
    const result = await deleteAreaOfInterest({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Delete user looking for.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// ==== User Expertise ====
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's 6 routes
// verbatim, including their exact legacy path names/params: GET /list, POST
// /save_n_add_position, POST /update_position/:designation_id, GET
// /enable_position/:designation_id, GET /disable_position/:designation_id,
// GET /delete_position/:designation_id. Role array `[0]` confirmed verbatim
// from every `checkAdminLoginToken(req.headers, [0])` call in the legacy
// file. FIX #1 is structurally enforced the same way as the Event
// Tags/Area of Interests routes above (single `res.json` per code path).
// This completes `systemSettingsRouter`'s full route set across all 5
// system-settings categories.

systemSettingsRouter.get('/user_expertise/list', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
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
  } catch (err: any) {
    console.log('User designation list error:', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.post('/user_expertise/save_n_add_position', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const result = await saveUserExpertise({ actor, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Save User expertise.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.post('/user_expertise/update_position/:designation_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.designation_id as string)
    const result = await updateUserExpertise({ actor, requestRowId, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Update User expertise.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/user_expertise/enable_position/:designation_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.designation_id as string)
    const result = await enableUserExpertise({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Enable User expertise.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/user_expertise/disable_position/:designation_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.designation_id as string)
    const result = await disableUserExpertise({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Disable User expertise.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

systemSettingsRouter.get('/user_expertise/delete_position/:designation_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const requestRowId = Number.parseInt(req.params.designation_id as string)
    const result = await deleteUserExpertise({ actor, requestRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Delete User expertise.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
