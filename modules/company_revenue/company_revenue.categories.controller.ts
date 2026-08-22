// modules/company_revenue/company_revenue.categories.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import { getRevenueStreamCategoriesList, saveNEditRevenueStreamCategory, deleteRevenueStreamCategory } from './company_revenue.categories.service'
import { saveNEditValidation } from './company_revenue.categories.validation'

/**
 * Ports controllers/admin_panel/category_tags/revenue_streams.js (Revenue
 * Stream Categories admin CRUD) into modules/company_revenue/'s existing
 * subfeature-file convention (see company_revenue.controller.ts /
 * company_revenue.service.ts already in this module), rather than the flat
 * system_settings.*.ts pattern used elsewhere in this migration.
 *
 * NOTE (confirmed in Step 1): models/app/static/revenue_streams_categoryM.js
 * has no `active_status` field, unlike most sibling category models — and the
 * legacy controller has no enable/disable route to match. None is ported here.
 */
export const revenueStreamCategoriesRouter: Router = express.Router()

/**
 * Ports GET /list (legacy lines 13-164).
 *
 * FIX #3 (genuine, intentional behavior change, approved by the user): the
 * legacy handler had ZERO checkAdminLoginToken call — unlike every sibling
 * category's list endpoint (confirmed in Step 1) — meaning any caller, with
 * or without a valid admin token, could hit it. checkAdminLoginToken(req.headers, [0])
 * is now ADDED here, matching the role array used by this same category's own
 * save_n_edit/delete handlers below. This is the ONLY intentional behavior
 * change in this task; everything else is a faithful port.
 *
 * FIX #5 (module-wide pagination convention): optional skip/limit query
 * params are now accepted, defaulting to a full list when omitted.
 */
revenueStreamCategoriesRouter.get('/list', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await getRevenueStreamCategoriesList({
      search: req.query.search as string | undefined,
      skipRaw: req.query.skip as string | undefined,
      limitRaw: req.query.limit as string | undefined,
    })
    return res.json(result)
  } catch (err: any) {
    console.error('Revenue category list error:', err)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports POST /save_n_edit verbatim (legacy lines 168-229). */
revenueStreamCategoriesRouter.post('/save_n_edit', saveNEditValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await saveNEditRevenueStreamCategory({ body: req.body, preValidationErrors: errObj })
    return res.json(result)
  } catch (err: any) {
    console.log('Save and edit revenue streams.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports GET /delete/:category_row_id verbatim (legacy lines 231-262). */
revenueStreamCategoriesRouter.get('/delete/:category_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await deleteRevenueStreamCategory(req.params.category_row_id as string)
    return res.json(result)
  } catch (err: any) {
    console.log('Delete revenue stream.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
