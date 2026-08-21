// modules/company/company.categories.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import {
  getCompanyCategoriesList,
  addOrUpdateCompanyCategory,
  updateCategories,
  enableCompanyCategory,
  disableCompanyCategory,
  deleteCompanyCategory,
} from './company.categories.service'
import { addNUpdateDetailsValidation, updateCategoriesValidation } from './company.categories.validation'

/**
 * Ports controllers/admin_panel/category_tags/company_business_model.js (Company
 * Categories admin CRUD) into modules/company/'s subfeature-file convention, per
 * this module's own naming pattern (see company.faq.*.ts / company.settings.*.ts)
 * rather than the flat system_settings.*.ts pattern used elsewhere in this
 * migration. Every route here requires checkAdminLoginToken(req.headers, [0]),
 * matching the legacy controller exactly.
 *
 * Only the FIRST-registered `POST /add_n_update_details` handler (legacy lines
 * 174-266, using `.collation({ locale: 'en', strength: 2 })` for case-insensitive
 * uniqueness) was ported — Express dispatches only to the first handler
 * registered for a given method+path, so the second `router.post('/add_n_update_details', ...)`
 * block (legacy lines 268-401, using $expr/$toLower) is dead code and was
 * intentionally left unported.
 */
export const companyCategoriesRouter: Router = express.Router()

/**
 * Ports GET /list (legacy lines 14-171). FIX #4: the legacy catch block leaked
 * err.message straight to the client — this controller's catch always returns
 * the generic message and logs server-side only. FIX #5: optional skip/limit
 * query params are now accepted (module-wide pagination convention), defaulting
 * to a full list when omitted.
 */
companyCategoriesRouter.get('/list', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    console.error('Business model company count error:', err)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports the reachable POST /add_n_update_details handler (legacy lines 174-266). */
companyCategoriesRouter.post('/add_n_update_details', addNUpdateDetailsValidation, async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const errObj = arrangeValidation(validationResult(req))
    const result = await addOrUpdateCompanyCategory({ body: req.body, preValidationErrors: errObj })
    return res.json(result)
  } catch (err: any) {
    console.log('Add and update Crypto category.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports POST /update_categories/:category_id (legacy lines 403-486). */
companyCategoriesRouter.post(
  '/update_categories/:category_id',
  updateCategoriesValidation,
  async (req: Request, res: Response) => {
    try {
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
    } catch (err: any) {
      console.error('Update Category Error:', err.message)
      return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  }
)

/** Ports GET /enable/:request_row_id (legacy lines 496-527). */
companyCategoriesRouter.get('/enable/:request_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await enableCompanyCategory({ requestRowIdRaw: req.params.request_row_id as string })
    return res.json(result)
  } catch (err: any) {
    console.log('Enable Crypto category.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports GET /disable/:request_row_id (legacy lines 531-562). */
companyCategoriesRouter.get('/disable/:request_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await disableCompanyCategory({ requestRowIdRaw: req.params.request_row_id as string })
    return res.json(result)
  } catch (err: any) {
    console.log('Disable Crypto category.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports GET /delete/:request_row_id (legacy lines 564-587). */
companyCategoriesRouter.get('/delete/:request_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await deleteCompanyCategory({ requestRowIdRaw: req.params.request_row_id as string })
    return res.json(result)
  } catch (err: any) {
    console.log('Delete Crypto category.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
