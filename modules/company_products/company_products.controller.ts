// modules/company_products/company_products.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import { getCompanyProductsList, getCompanyProductsListPublic, getExchangeCountryDetails, getOwnCompaniesList, getProductsForCompare } from './company_products.queries'
import { saveOrUpdateProduct, deleteProduct } from './company_products.service'
import { getCache, setCache, buildProductListKey } from './company_products.cache'
import { writeEndpointRateLimiter } from '../../middleware/rateLimiter'
import { getHoldingsForCompare } from '../company_holdings/company_holdings.queries'

export const companyProductsRouter: Router = express.Router()

/**
 * Ports controllers/app/company/products_n_holding/index.js's GET
 * /company_product_details/:company_row_id/:skip/:limit (lines 294-532) — public,
 * unauthenticated, uncached, matching the real source exactly. Mounted at the module's own
 * root ('/company/products_n_holding', not '.../company_products') to preserve the exact URL.
 */
companyProductsRouter.get('/company_product_details/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  try {
    const company_row_id = Number.parseInt(req.params.company_row_id as string)
    if (Number.isNaN(company_row_id)) {
      return res.json({ status: true, message: {} })
    }

    const skip = !Number.isNaN(Number.parseInt(req.params.skip as string)) ? Number.parseInt(req.params.skip as string) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit as string)) ? Number.parseInt(req.params.limit as string) : 100

    const { list, count } = await getCompanyProductsListPublic({ company_row_id, skip, limit })
    res.json({ status: true, message: list, count })
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

/**
 * Ports controllers/app/company/products_n_holding/index.js's GET /compare_company_products
 * (lines 300-486, Phase E.1 split) — combines this module's getProductsForCompare with
 * company_holdings's getHoldingsForCompare, matching the real source's single combined handler.
 * Mounted at the module's own root to preserve the exact URL
 * (products_n_holding/compare_company_products), consumed by frontend-appcp-typescript's
 * compareProductHoldingListEPS.
 */
companyProductsRouter.get('/compare_company_products', async (req: Request, res: Response) => {
  try {
    let company_row_ids: any = req.query.company_row_ids

    if (!company_row_ids) {
      return res.json({ status: false, message: 'company_row_ids is required' })
    }

    if (typeof company_row_ids === 'string') {
      try {
        company_row_ids = JSON.parse(company_row_ids)
      } catch {
        return res.json({ status: false, message: 'company_row_ids must be array' })
      }
    }

    if (!Array.isArray(company_row_ids)) {
      return res.json({ status: false, message: 'company_row_ids must be array' })
    }

    company_row_ids = company_row_ids.map((id: any) => Number.parseInt(id)).filter((id: number) => !Number.isNaN(id))

    const [productsByCompany, holdingsByCompany] = await Promise.all([
      getProductsForCompare(company_row_ids),
      getHoldingsForCompare(company_row_ids)
    ])

    const companies = company_row_ids.map((id: number) => ({
      company_row_id: id,
      tokens: productsByCompany[id]?.tokens || [],
      chains: productsByCompany[id]?.chains || [],
      exchanges: productsByCompany[id]?.exchanges || [],
      holdings: holdingsByCompany[id]?.holdings || []
    }))

    res.json({ status: true, companies })
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'Unexpected error occurred' } })
  }
})

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's POST
 * /update_n_save_details (lines 35-279). Rate-limited (new, same reasoning as
 * modules/company_revenue/'s Phase D write endpoints).
 */
companyProductsRouter.post('/company_products/update_n_save_details', writeEndpointRateLimiter, [
  check('company_type')
    .trim().not().isEmpty().withMessage('The Company Type field is required.')
    .isInt({ min: 1, max: 2 }).withMessage('The Company Type value field contains only 1 or 2.'),
  check('company_row_id')
    .trim().not().isEmpty().withMessage('The Company Row ID field is required.')
    .isInt().withMessage('The Company Row ID value field contains valid ID.'),
  check('register_type')
    .trim().not().isEmpty().withMessage('The Register Type field is required.')
    .isInt({ min: 1, max: 2 }).withMessage('The Register Type value field contains only 1 or 2.'),
  check('product_row_id')
    .trim().not().isEmpty().withMessage('The Product Row ID field is required.')
    .isInt().withMessage('The Product Row ID value field contains contains valid ID.'),
  check('product_type')
    .trim().not().isEmpty().withMessage('The Product Type field is required.')
    .isInt({ min: 1, max: 3 }).withMessage('The Product Type value field contains only 1,2 or 3.'),
], async (req: Request, res: Response) => {
  try {
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
    if (!checkUserToken.status) {
      return res.json({ status: false, message: checkUserToken.message })
    }

    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const result = await saveOrUpdateProduct({ actor: checkUserToken.message, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'Something went wrong' } })
  }
})

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's GET
 * /list/:company_row_id/:skip/:limit (lines 282-488).
 */
companyProductsRouter.get('/company_products/list/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
  if (!checkUserToken.status) {
    return res.json({ status: false, message: checkUserToken })
  }

  try {
    const errObj: Record<string, string> = {}

    if (Number.isNaN(Number.parseInt(req.params.skip as string))) errObj['skip'] = 'The parameter skip field must be contain valid number'
    if (Number.isNaN(Number.parseInt(req.params.limit as string))) errObj['limit'] = 'The parameter limit field must be contain valid number.'

    let company_row_id = 0
    if (!Number.isNaN(Number.parseInt(req.params.company_row_id as string))) {
      company_row_id = Number.parseInt(req.params.company_row_id as string)
    } else {
      errObj['company_row_id'] = 'The company row id field must be contain valid number.'
    }

    if (Object.keys(errObj).length) {
      return res.json({ status: false, message: errObj })
    }

    const skip = Number.parseInt(req.params.skip as string)
    const limit = Number.parseInt(req.params.limit as string)
    const search = req.query.search as string | undefined

    const key = buildProductListKey(company_row_id, skip, limit, search)
    const cache_response = await getCache({ key })
    if (cache_response.status) {
      return res.json({ status: true, message: cache_response.message.list, count: cache_response.message.count, cache_response_status: true })
    }

    const { list, count } = await getCompanyProductsList({ company_row_id, skip, limit, search })

    await setCache({ key, value: { list, count }, ttl: 1800 })

    return res.json({ status: true, message: list, count, cache_response_status: false })
  } catch (err: any) {
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's GET
 * /get_exchange_country_details/:product_row_id/:skip/:limit (lines 490-638).
 */
companyProductsRouter.get('/company_products/get_exchange_country_details/:product_row_id/:skip/:limit', async (req: Request, res: Response) => {
  const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
  if (!checkUserToken.status) {
    return res.json({ status: false, message: checkUserToken })
  }

  try {
    const errObj: Record<string, string> = {}
    if (Number.isNaN(Number.parseInt(req.params.skip as string))) errObj['skip'] = 'The parameter skip field must be contain valid number'
    if (Number.isNaN(Number.parseInt(req.params.limit as string))) errObj['limit'] = 'The parameter limit field must be contain valid number.'

    let product_row_id = 0
    if (!Number.isNaN(Number.parseInt(req.params.product_row_id as string))) {
      product_row_id = Number.parseInt(req.params.product_row_id as string)
    } else {
      errObj['product_row_id'] = 'The product row id must be valid number.'
    }

    if (Object.keys(errObj).length) {
      return res.json({ status: false, message: errObj })
    }

    const skip = Number.parseInt(req.params.skip as string)
    const limit = Number.parseInt(req.params.limit as string)

    const { list, count } = await getExchangeCountryDetails({ product_row_id, skip, limit })
    res.json({ status: true, message: list, count })
  } catch (err: any) {
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's GET
 * /delete_product/:edit_product_row_id (lines 640-798). Rate-limited (new).
 */
companyProductsRouter.get('/company_products/delete_product/:edit_product_row_id', writeEndpointRateLimiter, async (req: Request, res: Response) => {
  const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
  if (!checkUserToken.status) {
    return res.json(checkUserToken)
  }

  try {
    const result = await deleteProduct({ actor: checkUserToken.message, edit_product_row_id_raw: req.params.edit_product_row_id as string })
    res.json(result)
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's GET
 * /own_companies_list/:product_type/:product_row_id (lines 801-906).
 */
companyProductsRouter.get('/company_products/own_companies_list/:product_type/:product_row_id', async (req: Request, res: Response) => {
  const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
  if (!checkUserToken.status) {
    return res.json(checkUserToken)
  }

  try {
    const errObj: Record<string, string> = {}
    const check_in_array = [1, 2, 3]
    let product_type = 0
    if (!Number.isNaN(Number.parseInt(req.params.product_type as string))) {
      if (check_in_array.includes(Number.parseInt(req.params.product_type as string))) {
        product_type = Number.parseInt(req.params.product_type as string)
      } else {
        errObj['product_type'] = 'Sorry, Invalid product type.'
      }
    } else {
      errObj['product_type'] = 'The product type field must be contain 1,2 or 3.'
    }

    let product_row_id = 0
    if (Number.isNaN(Number.parseInt(req.params.product_row_id as string))) {
      errObj['product_row_id'] = 'The product row id field must be contain valid number.'
    } else {
      product_row_id = Number.parseInt(req.params.product_row_id as string)
    }

    let user_row_id = 0
    if (checkUserToken.message.user_type == 1) user_row_id = checkUserToken.message.user_row_id

    if (product_row_id && product_type === 1 && user_row_id) {
      const tokensM = require('../../models/markets/tokensM')
      const check_company = await tokensM.findOne({ _id: product_row_id, user_row_id }, { _id: 1 })
      if (!check_company) errObj['product_row_id'] = 'Invalid product row id.'
    }

    if (Object.keys(errObj).length) {
      return res.json({ status: false, message: errObj })
    }

    const result = await getOwnCompaniesList({ product_type, product_row_id })
    res.json({ status: true, message: result })
  } catch (err: any) {
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})
