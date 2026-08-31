// modules/company/company.regulatory_details.controller.ts
import express, { Router } from 'express'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
const { validationResult } = require('express-validator')
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { saveNEditType, deleteRegulatoryType } from './company.regulatory_details.types.service'
import { saveNEditBodies, deleteRegulatoryBody } from './company.regulatory_details.bodies.service'
import { saveNEditTypeValidation, saveNEditBodiesValidation } from './company.regulatory_details.validation'
import { asyncRoute } from '../../../middleware/asyncRoute'

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
regulatoryDetailsRouter.use(requireAdminAccess([0]))

/** Ports POST /save_n_edit (legacy lines 15-64). */
regulatoryDetailsRouter.post('/save_n_edit', writeEndpointRateLimiter, saveNEditTypeValidation, asyncRoute('Save and edit Regularities error:', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))

  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await saveNEditType({ body: req.body, preValidationErrors: errObj })
  return res.json(result)
}))

/** Ports GET /delete_type/:category_row_id (legacy lines 66-110). */
regulatoryDetailsRouter.get('/delete_type/:category_row_id', writeEndpointRateLimiter, asyncRoute('Delete regularity details.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await deleteRegulatoryType(req.params.category_row_id as string)
  return res.json(result)
}))

/** Ports POST /save_n_edit_bodies (legacy lines 113-221). */
regulatoryDetailsRouter.post('/save_n_edit_bodies', writeEndpointRateLimiter, saveNEditBodiesValidation, asyncRoute('Save and edit regulatory bodies error:', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))

  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await saveNEditBodies({ body: req.body, preValidationErrors: errObj })
  return res.json(result)
}))

/** Ports GET /delete_bodies/:category_row_id (legacy lines 226-278). */
regulatoryDetailsRouter.get('/delete_bodies/:category_row_id', writeEndpointRateLimiter, asyncRoute('Delete regulatory body error:', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await deleteRegulatoryBody(req.params.category_row_id as string)
  return res.json(result)
}))
