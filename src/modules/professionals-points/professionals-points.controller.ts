// modules/professionals-points/professionals-points.controller.ts
// Ports controllers/app/users/points.js. Mounted at a `_v2` suffix parallel to the untouched
// legacy '/points' mount.
import express, { Router, Request, Response } from 'express'
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { asyncRoute } from '../../../middleware/asyncRoute'
import { getPointsList, UserTokenAuthResult } from './professionals-points.service'

export const professionalsPointsRouter: Router = express.Router()

professionalsPointsRouter.get('/list/:skip/:limit', asyncRoute('Points list.', async (req: Request, res: Response) => {
  const auth: UserTokenAuthResult = checkUserLoginToken(req.headers)
  res.json(await getPointsList(auth, req.params.skip, req.params.limit, req.query.start_date, req.query.end_date))
}))
