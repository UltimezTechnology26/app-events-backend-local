// modules/benefits/benefits.controller.ts
//
// Ports controllers/main/community/benefits.js's GET /details. Mounted at a temporary `_v2`
// prefix ('/benefits_v2') parallel to the untouched legacy '/benefits' mount.
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
