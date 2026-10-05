// src/modules/events-faq/events-faq.controller.ts
//
// Ports controllers/events/faq.js's 3 routes, mounted at the same '/events/faq' path prefix
// (routes/events.js) to preserve every existing frontend call site unchanged - same cutover
// shape company.faq.controller.ts already used for '/company/faq'.
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import logger from '../../../config/logger'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { deleteFaq, getFaqList, reorderFaqDetails, updateFaqDetails } from './events-faq.service'
import { updateFaqDetailsValidation } from './events-faq.validation'

export const eventsFaqRouter: Router = express.Router()

const LOGIN_TOKEN_TYPE_EVENTS = [10]

eventsFaqRouter.post(
  '/update_faq_details',
  writeEndpointRateLimiter,
  updateFaqDetailsValidation,
  asyncRoute('Update FAQ Details.', async (req: Request, res: Response) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkUserToken = await checkAllLoginToken(req.headers, LOGIN_TOKEN_TYPE_EVENTS)
    const result = await updateFaqDetails(checkUserToken, req.body, errObj)
    res.json(result)
  }),
)

eventsFaqRouter.get(
  '/list/:event_row_id/:skip/:limit',
  asyncRoute('FAQ list.', async (req: Request, res: Response) => {
    const checkUserToken = await checkAllLoginToken(req.headers, LOGIN_TOKEN_TYPE_EVENTS)
    const result = await getFaqList(
      checkUserToken,
      req.params.event_row_id as string,
      req.params.skip as string,
      req.params.limit as string,
      req.query.search,
      req.query,
    )
    res.json(result)
  }),
)

// NOT migrated to asyncRoute — matches controllers/events/faq.js's own try/catch shape, same as
// company.faq.controller.ts's own delete_faq route (see that file's own comment: docs/error-
// handling-exceptions.md #7).
eventsFaqRouter.get('/delete_faq/:faq_row_id', async (req: Request, res: Response) => {
  try {
    const checkUserToken = await checkAllLoginToken(req.headers, LOGIN_TOKEN_TYPE_EVENTS)
    const result = await deleteFaq(checkUserToken, req.params.faq_row_id as string)
    res.json(result)
  } catch (err) {
    logger.error(`Delete FAQ Details. ${err instanceof Error ? err.message : String(err)}`)
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

// New - no frontend consumer yet (Events had no reorder route before this migration). Body shape
// ({ event_row_id, ordered_ids }) matches markets' own buildAdminReorderFaqs convention
// (markets-backend-local's src/modules/faq/faq.controller.ts) since there's no existing contract
// here to stay backward-compatible with.
eventsFaqRouter.post(
  '/reorder',
  writeEndpointRateLimiter,
  asyncRoute('Reorder FAQ Details.', async (req: Request, res: Response) => {
    const checkUserToken = await checkAllLoginToken(req.headers, LOGIN_TOKEN_TYPE_EVENTS)
    const result = await reorderFaqDetails(checkUserToken, req.body.event_row_id as string, req.body.ordered_ids)
    res.json(result)
  }),
)
