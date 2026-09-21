// modules/professionals-awards/professionals-awards.controller.ts
// Ports controllers/app/users/awards.js. Mounted at a `_v2` suffix parallel to the untouched
// legacy '/awards' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { updateAndSaveAward, getAwardsList, deleteAward } from './professionals-awards.service'
import { UserAuthResult } from './professionals-awards.types'

export const professionalsAwardsRouter: Router = express.Router()

professionalsAwardsRouter.post(
  '/update_n_save_details',
  writeEndpointRateLimiter,
  [
    check('award_title').not().isEmpty().withMessage('The Award Title field is required.'),
    check('award_description').not().isEmpty().withMessage('The Award Description field is required.'),
  ],
  asyncRoute('Update award details.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    res.json(await updateAndSaveAward(auth, req.body, errObj))
  }),
)

professionalsAwardsRouter.get('/list/:skip/:limit', asyncRoute('Award list.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await getAwardsList(auth, req.params.skip as string, req.params.limit as string, req.query.user_row_id, req.query.search))
}))

professionalsAwardsRouter.get('/delete_award/:award_row_id', asyncRoute('Delete award details.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await deleteAward(auth, req.params.award_row_id as string, req.query.user_row_id))
}))
