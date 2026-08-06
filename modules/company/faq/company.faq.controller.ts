// modules/company/company.faq.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const { checkAllLoginToken } = require('../../../middleware/authorization')
const { arrangeValidation } = require('../../../utils/helpers/helper')
import { saveOrUpdateFaqDetails, getFaqList, deleteFaqDetail } from './company.faq.service'
import { updateFaqDetailsValidation } from './company.faq.validation'

/**
 * Ports controllers/app/company/faq.js's 3 routes (Part 3 §7 Phase G step 2) — folded into
 * modules/company/ rather than a new module, per the user's explicit direction, mounted at the
 * same '/company/faq' path prefix to preserve every existing frontend call site unchanged.
 * Both app users and admins hit these same routes (checkAllLoginToken(...,[7])), matching the
 * real source exactly — no separate admin-only variant exists or is needed.
 */
export const companyFaqRouter: Router = express.Router()

companyFaqRouter.post('/update_faq_details', updateFaqDetailsValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await saveOrUpdateFaqDetails({ actor, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: any) {
    console.log('Update FAQ Details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companyFaqRouter.get('/list/:company_row_id/:skip/:limit', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    console.log('FAQ list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companyFaqRouter.get('/delete_faq/:faq_row_id', async (req: Request, res: Response) => {
  try {
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await deleteFaqDetail({ actor, faqRowIdRaw: req.params.faq_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Delete FAQ Details.', err.message)
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})
