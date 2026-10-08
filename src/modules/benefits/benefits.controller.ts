// modules/benefits/benefits.controller.ts
//
// Ports controllers/main/community/benefits.js's GET /details. CUTOVER COMPLETE (2026-10-07):
// that legacy file (and its own service file, services/main/benefits.ts) are gone; this module
// now owns the plain '/benefits' path (no more `_v2` suffix) with no parallel legacy sibling.
import express, { Router, Request, Response } from 'express'
import { getBenefitsDetails } from './benefits.service'

export const benefitsRouter: Router = express.Router()

benefitsRouter.get('/details', async (req: Request, res: Response) => {
  try {
    const result = await getBenefitsDetails(req.headers)
    if (!result.status) {
      return res.status(401).json(result)
    }
    return res.json(result)
  } catch (err) {
    console.error('❌ Error in /details route:', err)
    return res.status(500).json({ status: false, message: 'Something went wrong while fetching user details.', err: err instanceof Error ? err.message : String(err) })
  }
})
