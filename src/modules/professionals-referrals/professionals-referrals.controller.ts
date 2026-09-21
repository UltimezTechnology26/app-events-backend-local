// modules/professionals-referrals/professionals-referrals.controller.ts
// Ports controllers/app/users/referrals.js. Mounted at a `_v2` suffix parallel to the untouched
// legacy '/referrals' mount.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getReferralsList, UserTokenAuthResult } from './professionals-referrals.service'

export const professionalsReferralsRouter: Router = express.Router()

professionalsReferralsRouter.get('/list/:skip/:limit', asyncRoute('Referrals list.', async (req: Request, res: Response) => {
  const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
  res.json(await getReferralsList(auth, req.params.skip, req.params.limit, req.query.start_date, req.query.end_date))
}))
