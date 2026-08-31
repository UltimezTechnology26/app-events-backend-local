// modules/company_watchlist/company_watchlist.controller.ts
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { addToWatchlist, removeFromWatchlist, getWatchlistList } from './company_watchlist.service'

/**
 * Ports controllers/app/watchlist/company.js's 3 routes (Part 3 §7 Phase G step 4) — scaffolded
 * as its own module, `modules/company_watchlist/`, per the confirmed decision. Mounted at the
 * real source's original prefix ('/company_watchlist') to preserve every existing frontend call
 * site unchanged.
 */
export const companyWatchlistRouter: Router = express.Router()

/**
 * Additive safety net: every route in this router uses checkUserLoginToken(req.headers) as a
 * hard gate (enforced today inside company_watchlist.service.ts, which returns the actor object
 * unchanged when actor.status is false). Does not replace that per-handler/service check.
 */
companyWatchlistRouter.use((req: Request, res: Response, next) => {
  const actor = checkUserLoginToken(req.headers)
  if (!actor.status) {
    return res.json(actor)
  }
  next()
})

companyWatchlistRouter.get('/add_to_watchlist/:company_row_id', writeEndpointRateLimiter, asyncRoute('Company add to watchlist.', async (req, res) => {
  const actor = checkUserLoginToken(req.headers)
  const result = await addToWatchlist({ actor, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

companyWatchlistRouter.get('/remove_from_watchlist/:company_row_id', writeEndpointRateLimiter, asyncRoute('Remove from watchlist.', async (req, res) => {
  const actor = checkUserLoginToken(req.headers)
  const result = await removeFromWatchlist({ actor, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

companyWatchlistRouter.get('/list/:skip/:limit', asyncRoute('Professional details list.', async (req, res) => {
  const actor = checkUserLoginToken(req.headers)
  const result = await getWatchlistList({
    actor,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string | undefined,
    businessModelIdRaw: req.query.business_model_id as string | string[] | undefined,
    location: req.query.location as string | undefined,
  })
  res.json(result)
}))
