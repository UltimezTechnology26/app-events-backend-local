// modules/work-experience/work-experience.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken, checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { createOrUpdateWorkExperience, adminCreateOrUpdateWorkExperience, adminDeleteProfessionalDetail, deleteProfessionalDetail, getManualProfessionalDetailList } from './work-experience.service'
import {
  getIndividualProfessionalDetails,
  getProfessionalDetailList,
  getAdminIndividualProfessionalDetails,
  getAdminProfessionalDetailList
} from './work-experience.queries'
import { getCache, setCache } from './work-experience.cache'
import { asyncRoute } from '../../../middleware/asyncRoute'

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
// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #26.
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.log('Update professional details.', message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' + message })
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
], asyncRoute('Update professional details.', async (req, res) => {
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
}))

/**
 * Ports controllers/app/users/setting.js's GET /individual_professional_details/:professional_details_id
 * (lines ~2313-2600). getIndividualProfessionalDetails() already returns the fully-flattened
 * result object (or null) — this route just branches on that and builds the response envelope.
 * No caching on this route, matching the real source.
 */
appWorkExperienceRouter.get('/individual_professional_details/:professional_details_id', asyncRoute('Individual professional details.', async (req, res) => {
  const checkToken = checkUserLoginToken(req.headers)
  if (checkToken.status) {
    const user_row_id = checkToken.message
    const professional_details_id = Number.parseInt(req.params.professional_details_id as string)
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
}))

/**
 * Phase B (work-experience reconciliation, 2026-09-10). Ports controllers/app/users/setting.js's
 * GET /delete_professional_details/:professional_details_id (~2313-2352) — the last remaining
 * professionals-work-experience route not yet in this module. Mounted at a temporary `_v2` suffix
 * (`/delete_professional_details_v2/:id`) since the legacy route at the real path still exists and
 * this module's sibling routes were already cut over to the real path at some point before this
 * migration's involvement — adding a same-path route now would be silently unreachable (legacy's
 * router is registered first) and deleting the legacy route is a separate, explicitly-confirmed
 * cutover step, not bundled into this addition.
 */
appWorkExperienceRouter.get('/delete_professional_details_v2/:professional_details_id', asyncRoute('Delete professional details.', async (req, res) => {
  const checkToken = checkUserLoginToken(req.headers)
  if (!checkToken.status) return res.json(checkToken)
  res.json(await deleteProfessionalDetail(checkToken.message, req.params.professional_details_id as string))
}))

/**
 * Ports controllers/app/users/setting.js's GET /professional_detail_list/:skip/:limit
 * (lines ~2662-2930). Matches the real source's write-only caching (cache read stays unused,
 * a pre-existing quirk — see work-experience.queries.ts's own note on this endpoint).
 */
appWorkExperienceRouter.get('/professional_detail_list/:skip/:limit', asyncRoute('Professional details list.', async (req, res) => {
  const checkToken = checkUserLoginToken(req.headers)
  if (checkToken.status) {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip as string)) ? Number.parseInt(req.params.skip as string) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit as string)) ? Number.parseInt(req.params.limit as string) : 100
    const user_row_id = checkToken.message
    const key = `professional_detail_list_${skip}_${limit}_${user_row_id}`
    const cache_response = await getCache({ key })
    const get_query = await getProfessionalDetailList({ user_row_id, skip, limit })
    await setCache({ key, value: { list: get_query }, ttl: 1800 })
    return res.json({ status: true, message: get_query, cache_response_status: false })
  } else {
    res.json(checkToken)
  }
}))

/**
 * CONFIRMED BUG FIX: the admin panel's Delete action for Professional Details used to call the
 * legacy, ungated `GET admin_panel/users/delete_professional_details/:user_row_id/:professional_details_id`
 * (controllers/admin_panel/app/user.js:4538) directly — an immediate delete with no change-request
 * review, unlike this same section's already-gated Add/Edit. Mounted at a new, differently-shaped
 * path (`_v2` suffix plus a `:professional_row_id` param, matching this module's own
 * `/update_professional_details` body-param convention rather than the legacy route's two
 * positional params) so it can't collide with or shadow the still-live legacy route — deleting
 * that legacy route, once the frontend is confirmed cut over to this one, is a separate,
 * explicitly-confirmed step, not bundled into this addition.
 */
adminWorkExperienceRouter.get('/delete_professional_details_v2/:user_row_id/:professional_row_id', asyncRoute('Delete professional details.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [1])
  if (!checkToken.status) return res.json(checkToken)

  const target_user_row_id = Number.parseInt(req.params.user_row_id as string)
  const professional_row_id = Number.parseInt(req.params.professional_row_id as string)
  if (Number.isNaN(target_user_row_id) || Number.isNaN(professional_row_id)) {
    return res.json({ status: false, message: { alert_message: 'Sorry, Invalid Professional row id' } })
  }

  res.json(await adminDeleteProfessionalDetail({ admin_context: checkToken, target_user_row_id, professional_row_id }))
}))

/**
 * Ports controllers/admin_panel/app/user.js's GET /individual_professional_details/:professional_details_id
 * (lines ~4587-4843). getAdminIndividualProfessionalDetails() already returns the correct
 * {status,message} shape for both the found and not-found cases — just forward it.
 */
adminWorkExperienceRouter.get('/individual_professional_details/:professional_details_id', asyncRoute('Individual professional details.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [1])
  if (checkToken.status) {
    const professional_details_id = Number.parseInt(req.params.professional_details_id as string)
    if (!Number.isNaN(professional_details_id)) {
      const result = await getAdminIndividualProfessionalDetails(professional_details_id)
      return res.json(result)
    } else {
      res.json({ status: false, message: { alert_message: 'Sorry, Invalid Professional row id' } })
    }
  } else {
    res.json(checkToken)
  }
}))

/**
 * Ports controllers/admin_panel/app/user.js's GET /professional_detail_list/:user_row_id/:skip/:limit
 * (lines ~4845-5101). getAdminProfessionalDetailList() already handles the existence pre-check
 * and returns the correct {status,message} shape — just forward it.
 */
adminWorkExperienceRouter.get('/professional_detail_list/:user_row_id/:skip/:limit', asyncRoute('Professional details list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [1])
  if (checkToken.status) {
    const user_row_id = Number.parseInt(req.params.user_row_id as string)
    const skip = !Number.isNaN(Number.parseInt(req.params.skip as string)) ? Number.parseInt(req.params.skip as string) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit as string)) ? Number.parseInt(req.params.limit as string) : 100
    if (!Number.isNaN(user_row_id)) {
      const result = await getAdminProfessionalDetailList({ user_row_id, skip, limit })
      return res.json(result)
    } else {
      res.json({ status: false, message: { alert_message: 'Sorry, Invalid User row id' } })
    }
  } else {
    res.json(checkToken)
  }
}))

/**
 * Phase B (work-experience reconciliation, 2026-09-10). Ports controllers/admin_panel/app/user/
 * work_experiences.js's GET /manual_professional_detail_list/:user_row_id/:skip/:limit (~8-178) —
 * a company-grouped view scoped to manual-retrieval professionals, genuinely distinct from the
 * `/professional_detail_list` route above (see work-experience.service.ts's
 * getManualProfessionalDetailList doc comment for why this stays a separate function).
 *
 * Mounted directly (no `_v2` suffix needed): this module's adminWorkExperienceRouter lives at
 * `/admin_panel/users`, a completely different URL prefix than legacy's
 * `/admin_panel/work_experiences` — no path collision, so nothing here is silently shadowed or
 * shadows anything. Legacy's `work_experiences.js` stays live and untouched until the frontend is
 * confirmed to call this new path, at which point deleting the legacy file is a separate,
 * explicitly-confirmed cutover step.
 */
adminWorkExperienceRouter.get('/manual_professional_detail_list/:user_row_id/:skip/:limit', asyncRoute('Manual user professional details list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [1])
  if (!checkToken.status) return res.json(checkToken)

  const errObj: Record<string, string> = {}
  if (Number.isNaN(Number.parseInt(req.params.user_row_id as string))) {
    errObj['user_row_id'] = 'The User row id field must be contain valid number.'
  }
  if (Number.isNaN(Number.parseInt(req.params.skip as string))) {
    errObj['skip'] = 'The parameter skip field must be contain valid number'
  }
  if (Number.isNaN(Number.parseInt(req.params.limit as string))) {
    errObj['limit'] = 'The parameter limit field must be contain valid number.'
  }
  if (Object.keys(errObj).length) {
    return res.json({ status: false, message: errObj })
  }

  const user_row_id = Number.parseInt(req.params.user_row_id as string)
  const skip = Number.parseInt(req.params.skip as string)
  const limit = Number.parseInt(req.params.limit as string)
  res.json(await getManualProfessionalDetailList(user_row_id, skip, limit))
}))
