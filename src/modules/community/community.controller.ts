// modules/community/community.controller.ts
//
// Phase K of the Professionals migration (see plan doc). Ports controllers/main/community/
// pro_batch.js's GET /details (~94-265) into a dedicated community module. CUTOVER COMPLETE
// (2026-10-07): that legacy file and its mount are gone; this module now owns the plain
// '/pro_batch' path (no more `_v2` suffix) with no parallel legacy sibling.
//
// NO CACHING (deliberate, not an oversight): this GET route performs conditional writes as a
// side effect (21-day-challenge row insert, Pro Batch badge award + points + emails) on every
// request where the user newly qualifies. Legacy has no caching here for the same reason — caching
// the response would skip re-evaluating badge eligibility on subsequent calls, which is a real
// behavior change, not a safe perf win. Left uncached to match legacy exactly.
//
// FLAGGED, NOT FIXED: pro_batch.js imports `professionals_faqM`, `community_groupsM`,
// `calculateProfileScore`, `basic_details_points`, `social_details_points` but never references
// any of them in its one route — dead imports in the legacy file. Not carried into this module.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { getCommunityDetails } from './community.service'

export const communityRouter: Router = express.Router()

communityRouter.get('/details', async (req: Request, res: Response) => {
  try {
    const checkToken = checkUserLoginToken(req.headers)
    if (!checkToken.status) {
      return res.status(401).json({ status: false, message: { alert_message: checkToken.message } })
    }

    const userRowId = Number.parseInt(checkToken.message)
    const { httpStatus, body } = await getCommunityDetails(userRowId)
    return res.status(httpStatus).json(body)
  } catch (err) {
    // Matches legacy's own catch block exactly (including leaking err.message in the response) —
    // FLAGGED, NOT FIXED: every other module in this migration uses asyncRoute's generic message
    // instead of leaking err.message. Left as-is here since fixing it would change this route's
    // response shape on the error path, which needs explicit sign-off first.
    console.error('❌ Error in /details route:', err)
    return res.status(500).json({ status: false, message: 'Something went wrong while fetching user details.', err: err instanceof Error ? err.message : String(err) })
  }
})
