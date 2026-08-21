// modules/company/company.regulatory_details.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import {
  saveNEditType,
  deleteRegulatoryType,
  saveNEditBodies,
  deleteRegulatoryBody,
} from './company.regulatory_details.service'
import { saveNEditTypeValidation, saveNEditBodiesValidation } from './company.regulatory_details.validation'

/**
 * Ports controllers/admin_panel/category_tags/regularity_details.js (Regulatory
 * Types + Regulatory Bodies admin CRUD) into modules/company/'s subfeature-file
 * convention. This legacy controller is a genuine two-sub-resource outlier —
 * both sub-resources are kept in this single router, matching the legacy
 * file's own structure, rather than being split into two modules.
 *
 * There is NO GET /list route in the legacy file for either sub-resource —
 * none is added here.
 *
 * Every route requires checkAdminLoginToken(req.headers, [0]), matching the
 * legacy controller exactly.
 *
 * FIX #4: the legacy save_n_edit, save_n_edit_bodies, AND delete_bodies catch
 * blocks all leaked err.message straight to the client (legacy lines 60-63,
 * 213-220, and 270-277 respectively) — every catch block here returns only
 * the generic message and logs server-side only. (Only the legacy delete_type
 * catch block did not leak err.message; it's ported unchanged in that respect.)
 */
export const regulatoryDetailsRouter: Router = express.Router()

/** Ports POST /save_n_edit (legacy lines 15-64). */
regulatoryDetailsRouter.post('/save_n_edit', saveNEditTypeValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await saveNEditType({ body: req.body, preValidationErrors: errObj })
    return res.json(result)
  } catch (err: any) {
    console.error('Save and edit Regularities error:', err)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports GET /delete_type/:category_row_id (legacy lines 66-110). */
regulatoryDetailsRouter.get('/delete_type/:category_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await deleteRegulatoryType(req.params.category_row_id as string)
    return res.json(result)
  } catch (err: any) {
    console.log('Delete regularity details.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports POST /save_n_edit_bodies (legacy lines 113-221). */
regulatoryDetailsRouter.post('/save_n_edit_bodies', saveNEditBodiesValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await saveNEditBodies({ body: req.body, preValidationErrors: errObj })
    return res.json(result)
  } catch (err: any) {
    console.error('Save and edit regulatory bodies error:', err)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports GET /delete_bodies/:category_row_id (legacy lines 226-278). */
regulatoryDetailsRouter.get('/delete_bodies/:category_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await deleteRegulatoryBody(req.params.category_row_id as string)
    return res.json(result)
  } catch (err: any) {
    console.log('Delete regulatory body error:', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
