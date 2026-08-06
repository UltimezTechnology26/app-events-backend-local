// modules/company_revenue/company_revenue.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../middleware/authorization')
const { checkCompanyRowID } = require('../../utils/helpers/app_helper')
const { arrangeValidation } = require('../../utils/helpers/helper')
import { getRevenueOverview, getRevenueList, getRevenueIndividualAdmin, getRevenueListAdmin } from './company_revenue.queries'
import { saveOrUpdateRevenue, deleteRevenueDetails, saveRevenueDetailsAdmin, updateRevenueDetailsAdmin, deleteRevenueDetailsAdmin, bulkUploadRevenueAdmin } from './company_revenue.service'
import { getCache, setCache, buildRevenueOverviewKey, buildRevenueListKey } from './company_revenue.cache'
import { writeEndpointRateLimiter } from '../../middleware/rateLimiter'
const { checkAdminLoginToken } = require('../../middleware/authorization')

export const companyRevenueRouter: Router = express.Router()
export const companyRevenueAdminRouter: Router = express.Router()

/**
 * Ports controllers/app/company/revenue.js's GET /revenue_overview (lines
 * 12-236) — fully public, no auth check at all, matching the real source
 * exactly (not something this port adds or removes).
 */
companyRevenueRouter.get('/revenue_overview', async (req: Request, res: Response) => {
  try {
    const errObj: Record<string, string> = {}
    let company_row_id = 0

    if (req.query.company_row_id) {
      if (!Number.isNaN(Number.parseInt(req.query.company_row_id as string))) {
        company_row_id = Number.parseInt(req.query.company_row_id as string)
      } else {
        errObj['company_row_id'] = 'Invalid Company Row ID.'
      }
    } else {
      errObj['company_row_id'] = 'The Company row id field is required.'
    }

    let filterYears = 0
    if (req.query.year_filter && !Number.isNaN(Number.parseInt(req.query.year_filter as string))) {
      filterYears = Number.parseInt(req.query.year_filter as string)
    }

    if (Object.keys(errObj).length) {
      return res.json({ status: false, message: errObj })
    }

    const key = buildRevenueOverviewKey(company_row_id, filterYears)
    const cache_response = await getCache({ key })
    if (cache_response.status) {
      return res.json({ status: true, message: cache_response.message.list, cache_response_status: true })
    }

    const result = await getRevenueOverview({ company_row_id, filterYears })
    await setCache({ key, value: { list: result }, ttl: 1800 })

    return res.json({ status: true, message: result, cache_response_status: false })
  } catch (err: any) {
    console.log('Revenue Overview.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

/**
 * Ports controllers/app/company/revenue.js's POST /update_n_save_details (lines
 * 238-393). Rate-limited (new, Part 3 §7 Phase D step 1 — no such gate existed
 * on this write endpoint before this build, matching the same addition already
 * made to modules/team-members/'s write endpoints in Phase B step 7).
 */
companyRevenueRouter.post('/update_n_save_details', writeEndpointRateLimiter, [
  check('year')
    .trim().not().isEmpty().withMessage('The Year field is required.')
    .isInt().withMessage('The year field must be contains only integers.'),
  check('quarter')
    .trim().not().isEmpty().withMessage('The Quarter field is required.')
    .isInt().withMessage('The quarter field must be contains only integers.'),
  check('revenue')
    .trim().not().isEmpty().withMessage('The Reenue field is required.')
    .isInt().withMessage('The revenue field must be contains only integers.'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkUserToken = await checkAllLoginToken(req.headers, [7])
    if (!checkUserToken.status) {
      return res.json(checkUserToken)
    }

    const user_type = checkUserToken.message.user_type
    const user_row_id = user_type == 1 ? checkUserToken.message.user_row_id : 0

    const result = await saveOrUpdateRevenue({ user_row_id, user_type, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Save revenue details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

/**
 * Ports controllers/app/company/revenue.js's GET
 * /list/:company_row_id/:skip/:limit (lines 395-550). Ownership check is
 * deliberately left as the older checkCompanyRowID helper (NOT upgraded to
 * checkCompanyOwnership) — Part 3 §7 Phase D step 1 scopes the ownership-check
 * upgrade to the write endpoints only (update_n_save_details, delete_revenue);
 * widening it to this read endpoint would add an active_status/approval_status
 * gate that wasn't asked for and isn't a confirmed bug fix here.
 */
companyRevenueRouter.get('/list/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  const checkUserToken = await checkAllLoginToken(req.headers, [7])
  if (!checkUserToken.status) {
    return res.json(checkUserToken)
  }

  try {
    const errObj: Record<string, string> = {}

    if (Number.isNaN(Number.parseInt(req.params.skip as string))) {
      errObj['skip'] = 'The parameter skip field must contain a valid number'
    }
    if (Number.isNaN(Number.parseInt(req.params.limit as string))) {
      errObj['limit'] = 'The parameter limit field must contain a valid number.'
    }

    let company_row_id = 0
    if (!Number.isNaN(Number.parseInt(req.params.company_row_id as string))) {
      company_row_id = Number.parseInt(req.params.company_row_id as string)
    } else {
      errObj['company_row_id'] = 'The company row id field must contain a valid number.'
    }

    let user_row_id = 0
    if (checkUserToken.message.user_type == 1) {
      user_row_id = checkUserToken.message.user_row_id
    }

    if (company_row_id && user_row_id) {
      const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
      if (!check_company.status) {
        errObj['company_row_id'] = check_company.message.alert_message
      }
    }

    if (Object.keys(errObj).length) {
      return res.json({ status: false, message: errObj })
    }

    const skip = Number.parseInt(req.params.skip as string)
    const limit = Number.parseInt(req.params.limit as string)
    const year = req.query.year as string | undefined
    const quarter = req.query.quarter as string | undefined
    const revenue_stream = req.query.revenue_stream as string | undefined

    const key = buildRevenueListKey(company_row_id, skip, limit, year, quarter, revenue_stream)
    const cache_response = await getCache({ key })
    if (cache_response.status) {
      return res.json({ status: true, message: cache_response.message.list, count: cache_response.message.count, cache_response_status: true })
    }

    const { data, count } = await getRevenueList({ company_row_id, skip, limit, year, quarter, revenue_stream })

    await setCache({ key, value: { list: data, count }, ttl: 1800 })

    return res.json({ status: true, message: data, count, cache_response_status: false })
  } catch (err: any) {
    console.log('Revenue list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

/**
 * Ports controllers/app/company/revenue.js's GET
 * /delete_revenue/:revenue_row_id (lines 553-617). Rate-limited (new, same
 * reasoning as update_n_save_details above).
 */
companyRevenueRouter.get('/delete_revenue/:revenue_row_id', writeEndpointRateLimiter, async (req: Request, res: Response) => {
  try {
    const checkUserToken = await checkAllLoginToken(req.headers, [7])
    if (!checkUserToken.status) {
      return res.json(checkUserToken)
    }

    const user_type = checkUserToken.message.user_type
    const user_row_id = user_type == 1 ? checkUserToken.message.user_row_id : 0

    const result = await deleteRevenueDetails({ user_row_id, user_type, revenue_row_id_raw: req.params.revenue_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Delete revenue details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// ---------------------------------------------------------------------------
// Admin routes (Part 3 §7 Phase D step 3) — ports controllers/admin_panel/app/
// company.js's save_revenue_details through revenue_bulk_data.
// ---------------------------------------------------------------------------

/**
 * Ports controllers/admin_panel/app/company.js's POST
 * /save_revenue_details/:company_row_id (lines 4837-4931).
 *
 * CACHE-INVALIDATION GAP FIX (confirmed, same category as the 4 gaps already
 * found and fixed in Phase B — "delete + admin write paths never invalidated
 * caches the app-side read endpoints depend on"): the real source never called
 * any cache invalidation at all on this write path, meaning an admin-entered
 * revenue record wouldn't show up in the app-side revenue list/overview until
 * the existing 30-minute TTL expired. saveRevenueDetailsAdmin (service layer)
 * now calls invalidateCompanyRevenueCaches() same as the app-side write path.
 */
companyRevenueAdminRouter.post('/save_revenue_details/:company_row_id', [
  check('year')
    .isInt().withMessage('The year field must be contains only integers.')
    .trim().not().isEmpty().withMessage('The Year field is required.'),
  check('quarter')
    .trim().not().isEmpty().withMessage('The Quarter field is required.')
    .isInt().withMessage('The quarter field must be contains only integers.'),
  check('revenue')
    .trim().not().isEmpty().withMessage('The Reenue field is required.')
    .isInt().withMessage('The revenue field must be contains only integers.'),
], async (req: Request, res: Response) => {
  const errors = validationResult(req)
  const errObj = arrangeValidation(errors)

  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  try {
    const result = await saveRevenueDetailsAdmin({
      actor: checkToken.message,
      company_row_id_raw: req.params.company_row_id as string,
      body: req.body,
      preValidationErrors: errObj
    })
    res.json(result)
  } catch (err: any) {
    console.log('Save revenue details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports controllers/admin_panel/app/company.js's GET /revenue_individual/:request_row_id (lines 4933-4961). */
companyRevenueAdminRouter.get('/revenue_individual/:request_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const revenue_row_id = Number.parseInt(req.params.request_row_id as string)
    if (Number.isNaN(revenue_row_id)) {
      return res.json({ status: false, message: { alert_message: 'Sorry, Invalid Revenue row id' } })
    }

    const checkCompanyData = await getRevenueIndividualAdmin(revenue_row_id)
    if (checkCompanyData) {
      res.json({ status: true, message: checkCompanyData })
    } else {
      res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request Row ID' } })
    }
  } catch (err: any) {
    console.log('Individual revenue details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports controllers/admin_panel/app/company.js's GET /revenue_list/:company_row_id (lines 4963-4997). */
companyRevenueAdminRouter.get('/revenue_list/:company_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const company_row_id = Number.parseInt(req.params.company_row_id as string)
    if (Number.isNaN(company_row_id)) {
      return res.json({ status: false, message: { alert_message: 'Sorry, Invalid Company row id' } })
    }

    const companyM = require('../../models/app/company/companyM')
    const companyQuery = await companyM.findOne({ _id: company_row_id })
    if (!companyQuery) {
      return res.json({ status: false, message: { alert_message: 'Invalid Company Row Id' } })
    }

    const { list, count } = await getRevenueListAdmin(company_row_id)
    res.json({ status: true, message: list, count })
  } catch (err: any) {
    console.log('Revenue list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports controllers/admin_panel/app/company.js's POST
 * /update_revenue_details/:request_row_id (lines 4999-5107). Same
 * cache-invalidation gap fix as save_revenue_details above.
 */
companyRevenueAdminRouter.post('/update_revenue_details/:request_row_id', [
  check('year')
    .isInt().withMessage('The year field must contain only integers.')
    .not().isEmpty().withMessage('The Year field is required.').trim(),
  check('quarter')
    .isInt().withMessage('The quarter field must contain only integers.')
    .not().isEmpty().withMessage('The Quarter field is required.').trim(),
  check('revenue')
    .isInt().withMessage('The revenue field must contain only integers.')
    .not().isEmpty().withMessage('The Revenue field is required.').trim(),
  check('company_row_id')
    .isInt().withMessage('The Company Row ID field must contain only integers.')
    .not().isEmpty().withMessage('The Company Row ID field is required.').trim(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await updateRevenueDetailsAdmin({
      actor: checkToken.message,
      request_row_id_raw: req.params.request_row_id as string,
      body: req.body,
      preValidationErrors: errObj
    })
    res.json(result)
  } catch (err: any) {
    console.log('Update revenue details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports controllers/admin_panel/app/company.js's GET
 * /revenue_delete/:request_row_id (lines 5109-5150). Same cache-invalidation
 * gap fix as save_revenue_details above.
 */
companyRevenueAdminRouter.get('/revenue_delete/:request_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await deleteRevenueDetailsAdmin({
      actor: checkToken.message,
      revenue_row_id_raw: req.params.request_row_id as string
    })
    res.json(result)
  } catch (err: any) {
    console.log('Delete revenue details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports controllers/admin_panel/app/company.js's POST /revenue_bulk_data
 * (lines 5154-5288). Same cache-invalidation gap fix as save_revenue_details
 * above (only when at least one row was actually inserted).
 */
companyRevenueAdminRouter.post('/revenue_bulk_data', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await bulkUploadRevenueAdmin(req.body)
    res.json(result)
  } catch (err: any) {
    console.log('Upload revenue bulk data.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
