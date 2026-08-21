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

import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../middleware/authorization')
import {
  listPositions,
  savePosition,
  enablePosition,
  disablePosition,
  deletePosition,
} from './work-experience.positions.service'

export const positionsRouter: Router = express.Router()

positionsRouter.get('/list', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
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
  } catch (err: any) {
    console.log('Work positions list error:', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

positionsRouter.post('/update_position_details', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const result = await savePosition({ actor, input: req.body })
    return res.json(result)
  } catch (err: any) {
    console.log('Update User positions.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

positionsRouter.get('/enable_position/:position_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const positionRowId = Number.parseInt(req.params.position_row_id as string)
    const result = await enablePosition({ actor, positionRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Enable User positions.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

positionsRouter.get('/disable_position/:position_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const positionRowId = Number.parseInt(req.params.position_row_id as string)
    const result = await disablePosition({ actor, positionRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Disable User positions.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

positionsRouter.get('/delete_position/:position_row_id', async (req: Request, res: Response) => {
  const actor = checkAdminLoginToken(req.headers, [0])
  try {
    const positionRowId = Number.parseInt(req.params.position_row_id as string)
    const result = await deletePosition({ actor, positionRowId })
    return res.json(result)
  } catch (err: any) {
    console.log('Delete User positions.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
