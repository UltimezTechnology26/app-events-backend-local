// modules/company/company.categories.status.controller.ts
//
// Ports GET /enable/:request_row_id (legacy lines 496-527), GET
// /disable/:request_row_id (legacy lines 531-562), and GET
// /delete/:request_row_id (legacy lines 564-587) from
// controllers/admin_panel/category_tags/company_business_model.js. Split
// out of company.categories.controller.ts purely to stay under the
// file-length limit. Mounted with no extra path prefix onto
// companyCategoriesRouter, which already applies requireAdminAccess([0])
// before any of these routes run.
import express, { Router } from 'express'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import {
  enableCompanyCategory,
  disableCompanyCategory,
  deleteCompanyCategory,
} from './company.categories.status.service'
import { asyncRoute } from '../../../middleware/asyncRoute'

export const companyCategoriesStatusRouter: Router = express.Router()

companyCategoriesStatusRouter.get('/enable/:request_row_id', writeEndpointRateLimiter, asyncRoute('Enable Crypto category.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await enableCompanyCategory({ requestRowIdRaw: req.params.request_row_id as string })
  return res.json(result)
}))

companyCategoriesStatusRouter.get('/disable/:request_row_id', writeEndpointRateLimiter, asyncRoute('Disable Crypto category.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await disableCompanyCategory({ requestRowIdRaw: req.params.request_row_id as string })
  return res.json(result)
}))

companyCategoriesStatusRouter.get('/delete/:request_row_id', writeEndpointRateLimiter, asyncRoute('Delete Crypto category.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await deleteCompanyCategory({ requestRowIdRaw: req.params.request_row_id as string })
  return res.json(result)
}))
