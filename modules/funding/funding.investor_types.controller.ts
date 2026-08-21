// modules/funding/funding.investor_types.controller.ts
import express, { Router, Request, Response } from 'express'
const { checkAdminLoginToken } = require('../../middleware/authorization')
import { getFundingInvestorTypesList, saveOrUpdateFundingInvestorType, deleteFundingInvestorType } from './funding.investor_types.service'

/**
 * Ports controllers/admin_panel/category_tags/funding_investor_types.js (Funding
 * Investor Types admin CRUD) into modules/funding/'s existing convention (see
 * funding.controller.ts / funding.service.ts already in this module), including
 * FIX #1 (see funding.investor_types.service.ts): every handler below makes
 * exactly one res.json/return call, so the legacy fall-through bug (validation
 * error responded to without `return`, then falling into save/duplicate-check
 * logic) cannot recur here.
 */
export const fundingInvestorTypesRouter: Router = express.Router()

/**
 * Ports GET /list (legacy lines 11-254).
 *
 * FIX #5 (module-wide pagination convention): optional skip/limit query
 * params are now accepted, defaulting to a full list when omitted.
 */
fundingInvestorTypesRouter.get('/list', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await getFundingInvestorTypesList({
      search: req.query.search as string | undefined,
      investorTypeRaw: req.query.investor_type as string | undefined,
      skipRaw: req.query.skip as string | undefined,
      limitRaw: req.query.limit as string | undefined,
    })
    return res.json(result)
  } catch (err: any) {
    console.log('Funding investor types list.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports POST /save_n_edit (legacy lines 263-337) with FIX #1: the service
 * already `return`s immediately on validation failure, and this handler makes
 * exactly one `return res.json(...)` call — no branch here can respond twice
 * or fall through into further logic after already responding.
 */
fundingInvestorTypesRouter.post('/save_n_edit', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await saveOrUpdateFundingInvestorType(req.body)
    return res.json(result) // service already returns {status:false,...} for validation errors; controller must still `return` here
  } catch (err: any) {
    console.log('Save and edit funding investor type.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/** Ports GET /delete/:category_row_id verbatim (legacy lines 339-370). */
fundingInvestorTypesRouter.get('/delete/:category_row_id', async (req: Request, res: Response) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [0])
    if (!checkToken.status) {
      return res.json(checkToken)
    }

    const result = await deleteFundingInvestorType(req.params.category_row_id as string)
    return res.json(result)
  } catch (err: any) {
    console.log('Delete funding investor type.', err.message)
    return res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
