// modules/company_holdings/company_holdings.controller.ts
import express, { Router, Request, Response } from 'express'
const { checkAllLoginToken } = require('../../middleware/authorization')
import { getCompanyHoldingsList, getCompanyHoldingsListPublic, getHoldingsCompaniesList } from './company_holdings.queries'
import { saveOrUpdateHolding, deleteHolding } from './company_holdings.service'
import { getCache, setCache, buildHoldingListKey } from './company_holdings.cache'
import { writeEndpointRateLimiter } from '../../middleware/rateLimiter'

export const companyHoldingsRouter: Router = express.Router()

/**
 * Ports controllers/app/company/products_n_holding/index.js's GET
 * /company_holdings_details/:company_row_id/:skip/:limit (lines 535-674) — public,
 * unauthenticated, uncached. Mounted at the module's own root ('/company/products_n_holding')
 * to preserve the exact URL.
 */
companyHoldingsRouter.get('/company_holdings_details/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  try {
    const company_row_id = Number.parseInt(req.params.company_row_id as string)
    if (Number.isNaN(company_row_id)) {
      return res.json({ status: true, message: [] })
    }

    const skip = !Number.isNaN(Number.parseInt(req.params.skip as string)) ? Number.parseInt(req.params.skip as string) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit as string)) ? Number.parseInt(req.params.limit as string) : 100

    const { list, count } = await getCompanyHoldingsListPublic({ company_row_id, skip, limit })
    res.json({ status: true, message: list, count })
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

/** Ports controllers/app/company/products_n_holding/company_holding.js's POST /update_n_save_details (lines 18-211). Rate-limited (new). */
companyHoldingsRouter.post('/company_holding/update_n_save_details', writeEndpointRateLimiter, async (req: Request, res: Response) => {
  try {
    const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
    if (!checkUserToken.status) {
      return res.json({ status: false, message: checkUserToken.message })
    }

    const result = await saveOrUpdateHolding({ actor: checkUserToken.message, body: req.body, preValidationErrors: {} })
    res.json(result)
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'Something went wrong' } })
  }
})

/** Ports controllers/app/company/products_n_holding/company_holding.js's GET /list/:company_row_id/:skip/:limit (lines 213-388). */
companyHoldingsRouter.get('/company_holding/list/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
  if (!checkUserToken.status) {
    return res.json(checkUserToken)
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

    const key = buildHoldingListKey(company_row_id, skip, limit)
    const cache_response = await getCache({ key })
    if (cache_response.status) {
      return res.json({ status: true, message: cache_response.message.list, count: cache_response.message.count, cache_response_status: true })
    }

    const { list, count } = await getCompanyHoldingsList({ company_row_id, skip, limit })

    await setCache({ key, value: { list, count }, ttl: 1800 })

    return res.json({ status: true, message: list, count, cache_response_status: false })
  } catch (err: any) {
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

/** Ports controllers/app/company/products_n_holding/company_holding.js's GET /delete_holding/:holding_row_id (lines 392-515). Rate-limited (new). */
companyHoldingsRouter.get('/company_holding/delete_holding/:holding_row_id', writeEndpointRateLimiter, async (req: Request, res: Response) => {
  const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
  if (!checkUserToken.status) {
    return res.json(checkUserToken)
  }

  try {
    const result = await deleteHolding({ actor: checkUserToken.message, holding_row_id_raw: req.params.holding_row_id as string })
    res.json(result)
  } catch (err: any) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

/** Ports controllers/app/company/products_n_holding/company_holding.js's GET /companies_list/:token_row_id (lines 518-619). */
companyHoldingsRouter.get('/company_holding/companies_list/:token_row_id', async (req: Request, res: Response) => {
  const checkUserToken = await checkAllLoginToken(req.headers, [7, 4])
  if (!checkUserToken.status) {
    return res.json(checkUserToken)
  }

  try {
    let token_row_id = 0
    if (Number.isNaN(Number.parseInt(req.params.token_row_id as string))) {
      return res.json({ status: false, message: { token_row_id: 'The token row id field must be contain valid number.' } })
    }
    token_row_id = Number.parseInt(req.params.token_row_id as string)

    if (checkUserToken.message.user_type == 1) {
      const tokensM = require('../../models/markets/tokensM')
      const check_token_query = await tokensM.findOne({ _id: token_row_id, user_row_id: checkUserToken.message.user_row_id }, { _id: 1 })
      if (!check_token_query) {
        return res.json({ status: false, message: { token_row_id: 'Invalid token row id' } })
      }
    }

    const result = await getHoldingsCompaniesList(token_row_id)
    res.json({ status: true, message: result })
  } catch (err: any) {
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})
