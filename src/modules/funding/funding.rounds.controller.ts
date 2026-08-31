// modules/funding/funding.rounds.controller.ts
import express, { Router } from 'express'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
const { checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { getFundingRoundsList, saveOrUpdateFundingRound } from './funding.rounds.service'

/**
 * Ports controllers/admin_panel/category_tags/funding_rounds.js (Funding
 * Rounds admin CRUD) into modules/funding/'s existing convention (see
 * funding.investor_types.controller.ts already in this module).
 *
 * There is NO delete route here — the legacy controller never had one, so
 * adding one would be a new feature, not a migration (confirmed by reading
 * controllers/admin_panel/category_tags/funding_rounds.js in full: it only
 * defines GET /list and POST /save_n_edit).
 */
export const fundingRoundsRouter: Router = express.Router()
fundingRoundsRouter.use(requireAdminAccess([0]))

/**
 * Ports GET /list (legacy lines 11-235).
 *
 * Adds optional skip/limit query params (module-wide pagination convention),
 * defaulting to a full list when omitted — the legacy handler had no
 * pagination at all.
 */
fundingRoundsRouter.get('/list', asyncRoute('Funding rounds list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await getFundingRoundsList({
    search: req.query.search as string | undefined,
    skipRaw: req.query.skip as string | undefined,
    limitRaw: req.query.limit as string | undefined,
  })
  return res.json(result)
}))

/**
 * Ports POST /save_n_edit (legacy lines 240-301). The service returns
 * immediately on validation failure (see funding.rounds.service.ts for why
 * the legacy fall-through bug is not reproduced), and this handler makes
 * exactly one `return res.json(...)` call.
 */
fundingRoundsRouter.post('/save_n_edit', writeEndpointRateLimiter, asyncRoute('Save and edit funding rounds.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [0])
  if (!checkToken.status) {
    return res.json(checkToken)
  }

  const result = await saveOrUpdateFundingRound(req.body)
  return res.json(result)
}))
