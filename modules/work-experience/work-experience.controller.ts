// modules/work-experience/work-experience.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken, checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import { createOrUpdateWorkExperience, adminCreateOrUpdateWorkExperience } from './work-experience.service'
import {
  getIndividualProfessionalDetails,
  getProfessionalDetailList,
  getAdminIndividualProfessionalDetails,
  getAdminProfessionalDetailList
} from './work-experience.queries'
import { getCache, setCache } from './work-experience.cache'

/**
 * Two separate routers (not one shared router branching on user type, unlike funding's
 * pattern) because the app and admin paths are genuinely distinct handler functions with
 * distinct validators, auth checks, and response shapes. Both register at the SAME internal
 * path — '/update_professional_details' — since routes/app.js mounts at '/setting' and
 * routes/admin_panel.js mounts at '/users' (Task 6c wires the mounting; not done here).
 */
export const appWorkExperienceRouter: Router = express.Router()
export const adminWorkExperienceRouter: Router = express.Router()

/**
 * Ports the real source's "same shared errObj, no early return" behavior (see
 * setting.js ~2657-2911 / user.js ~5170-5388): express-validator errors and the service's own
 * validation errors are ONE shared object, checked exactly once, right before any save happens.
 * The controller no longer merges anything itself — express-validator's errObj is handed to the
 * service as `preValidationErrors`, the service folds it into its own errObj (business-logic keys
 * win on collision, since they're added after the spread), and the single combined result is what
 * gets returned to the client. This also means the service's failure gate now genuinely blocks the
 * save for a validator-only failure, instead of the DB write happening before the response merge.
 *
 * The admin path's bare 'Invalid User Row ID' string (checkUser lookup, unrelated to errObj) is
 * only ever reachable in the service once its own errObj — which already includes any validator
 * errors — is empty, so forwarding the service result as-is is correct for that edge case too.
 */
appWorkExperienceRouter.post('/update_professional_details', [
  check('responsibilities')
    .not().isEmpty().withMessage('The Responsibilities field is required.'),
  check('company_type')
    .trim().not().isEmpty().withMessage('The Company Type field is required.')
    .isInt({ min: 1, max: 2 }).withMessage('The Company Type field must be contains only integers.'),
  check('company_row_id')
    .trim().not().isEmpty().withMessage('The Company Row ID field is required.'),
  check('employment_type')
    .trim().not().isEmpty().withMessage('The Employment Type field is required.')
    .isInt({ min: 1, max: 5 }).withMessage('The Employment Type field must be contains only integers.'),
  check('till_date_status')
    .trim().not().isEmpty().withMessage('The Till Date Status field is required.')
    .isInt({ min: 1, max: 2 }).withMessage('The Till Date Status field must be contains only integers.'),
  check('start_date')
    .trim().not().isEmpty().withMessage('The Start Date field is required.')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const validatorErrObj = arrangeValidation(errors)

    const checkUserToken = checkUserLoginToken(req.headers)
    if (!checkUserToken.status) {
      return res.json({ status: false, message: { alert_message: checkUserToken.message } })
    }
    const user_row_id = checkUserToken.message

    let professional_details_id = 0
    if (!Number.isNaN(Number.parseInt(req.body.professional_details_id))) {
      professional_details_id = Number.parseInt(req.body.professional_details_id)
    }

    // Called unconditionally, matching the real source's no-early-return control flow — but
    // validatorErrObj is now passed in as preValidationErrors, so the service's own save-gating
    // check (its single `if (Object.keys(errObj).length > 0)`) blocks the save when it's non-empty.
    const serviceResult = await createOrUpdateWorkExperience({
      user_row_id,
      professional_details_id,
      body: req.body,
      preValidationErrors: validatorErrObj
    })

    return res.json(serviceResult)
  } catch (err: any) {
    console.log('Update professional details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' + err.message })
  }
})

adminWorkExperienceRouter.post('/update_professional_details', [
  check('user_row_id')
    .trim().not().isEmpty().withMessage('The User row id field is required.'),
  check('company_type')
    .trim().not().isEmpty().withMessage('The Company Type field is required.')
    .isInt({ min: 1, max: 2 }).withMessage('The Company Type field must be contains only integers.'),
  check('company_row_id')
    .trim().not().isEmpty().withMessage('The Company Row ID field is required.'),
  check('employment_type')
    .trim().not().isEmpty().withMessage('The Employment Type field is required.')
    .isInt({ min: 1, max: 5 }).withMessage('The Employment Type field must be contains only integers.'),
  check('till_date_status')
    .trim().not().isEmpty().withMessage('The Till Date Status field is required.')
    .isInt({ min: 1, max: 2 }).withMessage('The Funding Type field must be contains only integers.')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const validatorErrObj = arrangeValidation(errors)

    const checkToken = checkAdminLoginToken(req.headers, [1])
    if (!checkToken.status) {
      return res.json({ status: false, message: { alert_message: checkToken.message } })
    }

    let target_user_row_id = 0
    if (!Number.isNaN(Number.parseInt(req.body.user_row_id))) {
      target_user_row_id = Number.parseInt(req.body.user_row_id)
    }
    let professional_row_id = 0
    if (!Number.isNaN(Number.parseInt(req.body.professional_row_id))) {
      professional_row_id = Number.parseInt(req.body.professional_row_id)
    }

    // Called unconditionally, same reasoning as the app route above.
    const serviceResult = await adminCreateOrUpdateWorkExperience({
      admin_context: checkToken,
      target_user_row_id,
      professional_row_id,
      body: req.body,
      preValidationErrors: validatorErrObj
    })

    return res.json(serviceResult)
  } catch (err: any) {
    console.log('Update professional details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.', err: err.message })
  }
})

/**
 * Ports controllers/app/users/setting.js's GET /individual_professional_details/:professional_details_id
 * (lines ~2313-2600). getIndividualProfessionalDetails() already returns the fully-flattened
 * result object (or null) — this route just branches on that and builds the response envelope.
 * No caching on this route, matching the real source.
 */
appWorkExperienceRouter.get('/individual_professional_details/:professional_details_id', async (req, res) => {
  try {
    const checkToken = checkUserLoginToken(req.headers)
    if (checkToken.status) {
      const user_row_id = checkToken.message
      const professional_details_id = Number.parseInt(req.params.professional_details_id)
      if (!Number.isNaN(professional_details_id)) {
        const result = await getIndividualProfessionalDetails(user_row_id, professional_details_id)
        if (result) {
          return res.json({ status: true, message: result })
        }
        return res.json({ status: false, message: { alert_message: 'Sorry, Invalid Professional row id' } })
      } else {
        res.json({ status: false, message: { alert_message: 'Sorry, Invalid Professional row id' } })
      }
    } else {
      res.json(checkToken)
    }
  } catch (err: any) {
    console.log('Individual professional details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports controllers/app/users/setting.js's GET /professional_detail_list/:skip/:limit
 * (lines ~2662-2930). Matches the real source's write-only caching (cache read stays unused,
 * a pre-existing quirk — see work-experience.queries.ts's own note on this endpoint).
 */
appWorkExperienceRouter.get('/professional_detail_list/:skip/:limit', async (req, res) => {
  const checkToken = checkUserLoginToken(req.headers)
  if (checkToken.status) {
    try {
      const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
      const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
      const user_row_id = checkToken.message
      const key = `professional_detail_list_${skip}_${limit}_${user_row_id}`
      const cache_response = await getCache({ key })
      const get_query = await getProfessionalDetailList({ user_row_id, skip, limit })
      await setCache({ key, value: { list: get_query }, ttl: 1800 })
      return res.json({ status: true, message: get_query, cache_response_status: false })
    } catch (err: any) {
      console.log('Professional details list.', err.message)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  } else {
    res.json(checkToken)
  }
})

/**
 * Ports controllers/admin_panel/app/user.js's GET /individual_professional_details/:professional_details_id
 * (lines ~4587-4843). getAdminIndividualProfessionalDetails() already returns the correct
 * {status,message} shape for both the found and not-found cases — just forward it.
 */
adminWorkExperienceRouter.get('/individual_professional_details/:professional_details_id', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [1])
  if (checkToken.status) {
    try {
      const professional_details_id = Number.parseInt(req.params.professional_details_id)
      if (!Number.isNaN(professional_details_id)) {
        const result = await getAdminIndividualProfessionalDetails(professional_details_id)
        return res.json(result)
      } else {
        res.json({ status: false, message: { alert_message: 'Sorry, Invalid Professional row id' } })
      }
    } catch (err: any) {
      console.log('Individual professional details.', err.message)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  } else {
    res.json(checkToken)
  }
})

/**
 * Ports controllers/admin_panel/app/user.js's GET /professional_detail_list/:user_row_id/:skip/:limit
 * (lines ~4845-5101). getAdminProfessionalDetailList() already handles the existence pre-check
 * and returns the correct {status,message} shape — just forward it.
 */
adminWorkExperienceRouter.get('/professional_detail_list/:user_row_id/:skip/:limit', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [1])
  if (checkToken.status) {
    const user_row_id = Number.parseInt(req.params.user_row_id)
    try {
      const skip = !Number.isNaN(Number.parseInt(req.params.skip)) ? Number.parseInt(req.params.skip) : 0
      const limit = !Number.isNaN(Number.parseInt(req.params.limit)) ? Number.parseInt(req.params.limit) : 100
      if (!Number.isNaN(user_row_id)) {
        const result = await getAdminProfessionalDetailList({ user_row_id, skip, limit })
        return res.json(result)
      } else {
        res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
      }
    } catch (err: any) {
      console.log('Professional details list.', err.message)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  } else {
    res.json(checkToken)
  }
})
