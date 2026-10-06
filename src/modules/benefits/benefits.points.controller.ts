// modules/benefits/benefits.points.controller.ts
// Ports controllers/app/users/points.js. Mounted at a `_v2` suffix parallel to the untouched
// legacy '/points' mount.
//
// Moved here from src/modules/professionals-points/ (2026-10-05): grouped alongside benefits,
// since both read/award the same professionals_pointsM points ledger, rather than living in their
// own single-route module.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getPointsList, UserTokenAuthResult } from './benefits.points.service'

export const benefitsPointsRouter: Router = express.Router()

benefitsPointsRouter.get('/list/:skip/:limit', asyncRoute('Points list.', async (req: Request, res: Response) => {
  const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
  res.json(await getPointsList(auth, req.params.skip, req.params.limit, req.query.start_date, req.query.end_date))
}))
