// modules/company/company.faq.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const { checkAllLoginToken } = require('../../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import logger from '../../../../config/logger'
import { writeEndpointRateLimiter } from '../../../../middleware/rateLimiter'
import { saveOrUpdateFaqDetails, getFaqList, deleteFaqDetail } from './company.faq.service'
import { updateFaqDetailsValidation } from './company.faq.validation'
import { asyncRoute } from '../../../../middleware/asyncRoute'

/**
 * Ports controllers/app/company/faq.js's 3 routes (Part 3 §7 Phase G step 2) — folded into
 * modules/company/ rather than a new module, per the user's explicit direction, mounted at the
 * same '/company/faq' path prefix to preserve every existing frontend call site unchanged.
 * Both app users and admins hit these same routes (checkAllLoginToken(...,[7])), matching the
 * real source exactly — no separate admin-only variant exists or is needed.
 */
export const companyFaqRouter: Router = express.Router()

/**
 * Additive safety net: every route in this router uses checkAllLoginToken(req.headers, [7])
 * (enforced today inside company.faq.service.ts, which returns the actor object unchanged
 * when actor.status is false). This does not replace that per-handler/service-level check —
 * it's a belt-and-suspenders default-closed gate in front of it.
 */
companyFaqRouter.use(async (req: Request, res: Response, next) => {
  const actor = await checkAllLoginToken(req.headers, [7])
  if (!actor.status) {
    return res.json(actor)
  }
  next()
})

companyFaqRouter.post('/update_faq_details', writeEndpointRateLimiter, updateFaqDetailsValidation, asyncRoute('Update FAQ Details.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const actor = await checkAllLoginToken(req.headers, [7])
  const result = await saveOrUpdateFaqDetails({ actor, body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

companyFaqRouter.get('/list/:company_row_id/:skip/:limit', asyncRoute('FAQ list.', async (req, res) => {
  const actor = await checkAllLoginToken(req.headers, [7])
  const search = req.query.search ? sanitize(req.query.search as string) : undefined
  const result = await getFaqList({
    actor,
    companyRowIdRaw: req.params.company_row_id as string,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search,
  })
  res.json(result)
}))

// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #7.
companyFaqRouter.get('/delete_faq/:faq_row_id', async (req: Request, res: Response) => {
  try {
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await deleteFaqDetail({ actor, faqRowIdRaw: req.params.faq_row_id as string })
    res.json(result)
  } catch (err) {
    logger.error(`Delete FAQ Details. ${err instanceof Error ? err.message : String(err)}`)
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})
