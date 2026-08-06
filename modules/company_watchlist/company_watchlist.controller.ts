// modules/company_watchlist/company_watchlist.controller.ts
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken } = require('../../middleware/authorization')
import { addToWatchlist, removeFromWatchlist, getWatchlistList } from './company_watchlist.service'

/**
 * Ports controllers/app/watchlist/company.js's 3 routes (Part 3 §7 Phase G step 4) — scaffolded
 * as its own module, `modules/company_watchlist/`, per the confirmed decision. Mounted at the
 * real source's original prefix ('/company_watchlist') to preserve every existing frontend call
 * site unchanged.
 */
export const companyWatchlistRouter: Router = express.Router()

companyWatchlistRouter.get('/add_to_watchlist/:company_row_id', async (req: Request, res: Response) => {
  try {
    const actor = checkUserLoginToken(req.headers)
    const result = await addToWatchlist({ actor, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Company add to watchlist.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyWatchlistRouter.get('/remove_from_watchlist/:company_row_id', async (req: Request, res: Response) => {
  try {
    const actor = checkUserLoginToken(req.headers)
    const result = await removeFromWatchlist({ actor, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Remove from watchlist.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyWatchlistRouter.get('/list/:skip/:limit', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    console.log('Professional details list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})
