// modules/professionals-faq/professionals-faq.controller.ts
// Ports controllers/app/users/faq.js. Mounted at a `_v2` suffix parallel to the untouched legacy
// '/users/faq' mount.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { updateFaqDetails, getFaqList, deleteFaq } from './professionals-faq.service'
import { UserAuthResult } from './professionals-faq.types'

export const professionalsFaqRouter: Router = express.Router()

professionalsFaqRouter.post(
  '/update_faq_details',
  writeEndpointRateLimiter,
  [
    check('faq_question').not().isEmpty().withMessage('The Faq Question field is required.'),
    check('faq_answer').not().isEmpty().withMessage('The Faq Answer field is required.'),
  ],
  asyncRoute('Update FAQ Details.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
    res.json(await updateFaqDetails(auth, req.body, errObj))
  }),
)

professionalsFaqRouter.get('/list/:skip/:limit', asyncRoute('FAQ list.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await getFaqList(auth, req.params.skip as string, req.params.limit as string, req.query.user_row_id, req.query.search))
}))

professionalsFaqRouter.get('/delete_faq/:faq_row_id', asyncRoute('Delete FAQ Details.', async (req: Request, res: Response) => {
  const auth: UserAuthResult = await checkAllLoginToken(req.headers, [1])
  res.json(await deleteFaq(auth, req.params.faq_row_id as string, req.query.user_row_id))
}))
