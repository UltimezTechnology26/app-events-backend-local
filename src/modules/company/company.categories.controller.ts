// modules/company/company.categories.controller.ts
import express, { Router } from 'express'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
const { validationResult } = require('express-validator')
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { getCompanyCategoriesList, updateCategories } from './company.categories.service'
import { addOrUpdateCompanyCategory } from './company.categories.upsert.service'
import { addNUpdateDetailsValidation, updateCategoriesValidation } from './company.categories.validation'
import { companyCategoriesStatusRouter } from './company.categories.status.controller'
import { asyncRoute } from '../../../middleware/asyncRoute'

/**
 * Ports controllers/admin_panel/category_tags/company_business_model.js (Company
 * Categories admin CRUD) into modules/company/'s subfeature-file convention, per
 * this module's own naming pattern (see company.faq.*.ts / company.settings.*.ts)
 * rather than the flat system_settings.*.ts pattern used elsewhere in this
 * migration. Every route here requires checkAdminLoginToken(req.headers, [0]),
 * matching the legacy controller exactly. Enable/disable/delete routes live in
 * company.categories.status.controller.ts — split out purely to stay under the
 * file-length limit and mounted below with no extra path prefix.
 *
 * Only the FIRST-registered `POST /add_n_update_details` handler (legacy lines
 * 174-266, using `.collation({ locale: 'en', strength: 2 })` for case-insensitive
 * uniqueness) was ported — Express dispatches only to the first handler
 * registered for a given method+path, so the second `router.post('/add_n_update_details', ...)`
 * block (legacy lines 268-401, using $expr/$toLower) is dead code and was
 * intentionally left unported.
 */
export const companyCategoriesRouter: Router = express.Router()
companyCategoriesRouter.use(requireAdminAccess([0]))

/**
 * Ports GET /list (legacy lines 14-171). FIX #4: the legacy catch block leaked
 * err.message straight to the client — this controller's catch always returns
 * the generic message and logs server-side only. FIX #5: optional skip/limit
 * query params are now accepted (module-wide pagination convention), defaulting
 * to a full list when omitted.
 */
companyCategoriesRouter.get('/list', asyncRoute('Business model company count error:', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await getCompanyCategoriesList({
    search: req.query.search as string | undefined,
    status: req.query.status as string | undefined,
    skipRaw: req.query.skip as string | undefined,
    limitRaw: req.query.limit as string | undefined,
  })
  return res.json(result)
}))

/** Ports the reachable POST /add_n_update_details handler (legacy lines 174-266). */
companyCategoriesRouter.post('/add_n_update_details', writeEndpointRateLimiter, addNUpdateDetailsValidation, asyncRoute('Add and update Crypto category.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const errObj = arrangeValidation(validationResult(req))
  const result = await addOrUpdateCompanyCategory({ body: req.body, preValidationErrors: errObj })
  return res.json(result)
}))

/** Ports POST /update_categories/:category_id (legacy lines 403-486). */
companyCategoriesRouter.post(
  '/update_categories/:category_id',
  writeEndpointRateLimiter,
  updateCategoriesValidation,
  asyncRoute('Update Category Error:', async (req, res) => {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const errObj = arrangeValidation(validationResult(req))
    const result = await updateCategories({
      categoryIdRaw: req.params.category_id as string,
      body: req.body,
      preValidationErrors: errObj,
    })
    return res.json(result)
  })
)

companyCategoriesRouter.use(companyCategoriesStatusRouter)
