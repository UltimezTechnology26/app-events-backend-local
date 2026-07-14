// modules/team-members/team-members.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkUserLoginToken, checkAllLoginToken, checkAdminLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
const companyM = require('../../models/app/company/companyM')
import { createOrUpdateEmployeeDetails, adminCreateOrUpdateEmployeeDetails } from './team-members.service'
import { getEmployeeList, getEmployeeIndividualDetails, getAdminEmployeeList } from './team-members.queries'
import { getCache, setCache } from './team-members.cache'

/**
 * Two separate routers (not one shared router branching on user type), matching the pattern
 * established by work-experience.controller.ts: the app and admin paths are genuinely distinct
 * handler functions with distinct validators, auth checks, and response shapes. Both register at
 * the SAME internal path per route — routes/app.js and routes/admin_panel.js do the external
 * mounting (not done here).
 */
export const appTeamMembersRouter: Router = express.Router()
export const adminTeamMembersRouter: Router = express.Router()

/**
 * Ports controllers/app/company/employee.js's POST /update_employee_details (lines ~21-238).
 * Auth uses checkAllLoginToken (awaited), unlike the sibling GET routes below which use
 * checkUserLoginToken — this is a real, preserved divergence from the real source, not a typo.
 * On auth failure the real source does a bare passthrough of `checkUserToken.message` (NOT wrapped
 * in `{ alert_message }`) — preserved exactly.
 */
appTeamMembersRouter.post('/update_employee_details', [
  check('user_account_type')
    .not().isEmpty().withMessage('The User Account Type field is required.')
    .isInt({ min: 1, max: 2 }).withMessage('The User Account Type field must be contains only integers.'),
  check('user_row_id')
    .not().isEmpty().withMessage('The User Row ID field is required.'),
  check('responsibilities')
    .not().isEmpty().withMessage('The Responsibilities field is required.'),
  check('employment_type')
    .trim().not().isEmpty().withMessage('The Employment Type field is required.')
    .isInt({ min: 1, max: 5 }).withMessage('The Employment Type field must be contains only integers.'),
  check('designation_type')
    .trim().not().isEmpty().withMessage('The Designation Type field is required.')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkUserToken = await checkAllLoginToken(req.headers, [7])
    if (checkUserToken.status) {
      const company_owner_user_row_id = checkUserToken.message?.user_row_id

      let work_row_id = 0
      if (!Number.isNaN(Number.parseInt(req.body.work_row_id))) {
        work_row_id = Number.parseInt(req.body.work_row_id)
      }

      // Called unconditionally, matching the real source's no-early-return control flow — errObj
      // is passed in as preValidationErrors, and the service's own single save-gating check
      // blocks the save when the combined errObj is non-empty.
      const serviceResult = await createOrUpdateEmployeeDetails({
        company_owner_user_row_id,
        work_row_id,
        body: req.body,
        preValidationErrors: errObj
      })

      res.json(serviceResult)
    } else {
      res.json({ status: false, message: checkUserToken?.message })
    }
  } catch (err: any) {
    console.log('Update employee details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports controllers/admin_panel/app/company_employees.js's POST /update_employee_details
 * (lines ~16-231). Auth uses checkAdminLoginToken — NOT awaited (it's synchronous), unlike the
 * app route's awaited checkAllLoginToken above. On auth failure the real source does a raw
 * passthrough of the whole `checkToken` object — preserved exactly.
 */
adminTeamMembersRouter.post('/update_employee_details', [
  check('employment_type')
    .trim().not().isEmpty().withMessage('The Employment Type field is required.')
    .isInt({ min: 1, max: 5 }).withMessage('The Employment Type field must be contains only integers.'),
  check('designation_type')
    .trim().not().isEmpty().withMessage('The Designation Type field is required.')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)

    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
      let work_row_id = 0
      if (!Number.isNaN(Number.parseInt(req.body.work_row_id))) {
        work_row_id = Number.parseInt(req.body.work_row_id)
      }

      // Called unconditionally, same reasoning as the app route above.
      const serviceResult = await adminCreateOrUpdateEmployeeDetails({
        admin_context: checkToken,
        work_row_id,
        body: req.body,
        preValidationErrors: errObj
      })

      res.json(serviceResult)
    } else {
      res.json(checkToken)
    }
  } catch (err: any) {
    console.log('Update employee details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports controllers/app/company/employee.js's GET /list/:skip/:limit (lines ~240-706). Company
 * resolution (own-company lookup + approval_status gate) stays a controller-layer concern, same
 * as the individual_details route below — getEmployeeList() only accepts an already-resolved
 * company_row_id.
 *
 * Caching: the cache read genuinely short-circuits. The write path is real/functional but
 * UNUSUAL ordering — `res.json(...)` is called BEFORE `await setCache(...)`, the reverse of the
 * far more common cache-then-respond order elsewhere in this codebase. Preserved exactly.
 */
appTeamMembersRouter.get('/list/:skip/:limit', async (req, res) => {
  try {
    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
      const user_row_id = checkUserToken.message
      const check_company_query = await companyM.findOne({ user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
      if (check_company_query) {
        if (check_company_query.approval_status == 1) {
          const company_row_id = check_company_query._id
          const limit = Number.parseInt(req.params.limit)
          const skip = Number.parseInt(req.params.skip)
          const key = `employee_list_${company_row_id}_${skip}_${limit}_${req.query.search || ''}`

          const cache_response = await getCache({ key })
          if (cache_response.status) {
            return res.json({
              status: true,
              message: cache_response.message.get_query,
              counts: cache_response.message.counts,
              cache_response_status: true
            })
          }

          const { get_query, counts } = await getEmployeeList({
            company_row_id,
            skip,
            limit,
            search: req.query.search as string | undefined
          })

          // Respond BEFORE writing the cache — matches the real source's ordering exactly.
          res.json({ status: true, message: get_query, counts, cache_response_status: false })
          await setCache({ key, value: { get_query, counts }, ttl: 1800 })
        } else {
          res.json({ status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } })
        }
      } else {
        res.json({ status: false, message: { alert_message: 'Sorry, This user company does not exist.' } })
      }
    } else {
      res.json(checkUserToken)
    }
  } catch (err: any) {
    console.log('Employee list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET /list/:skip/:limit
 * (lines ~654-942). No company scoping (admin sees every company) and no caching at all, matching
 * the real source. The response leaks the raw `query` filter array as a 3rd top-level field —
 * preserved verbatim, not something to "clean up" here.
 */
adminTeamMembersRouter.get('/list/:skip/:limit', async (req, res) => {
  try {
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (checkToken.status) {
      const limit = Number.parseInt(req.params.limit)
      const skip = Number.parseInt(req.params.skip)

      const { get_query, counts, query } = await getAdminEmployeeList({
        skip,
        limit,
        search: req.query.search as string | undefined,
        verified_status: req.query.verified_status as string | undefined,
        employment_type: req.query.employment_type as string | undefined
      })

      res.json({ status: true, message: get_query, counts, query })
    } else {
      res.json(checkToken)
    }
  } catch (err: any) {
    console.log('Employees list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports controllers/app/company/employee.js's GET /individual_details/:request_row_id
 * (lines ~708-916). App-only — admin has no equivalent route. Company resolution stays a
 * controller-layer concern, same as the list route above.
 *
 * Caching: unlike the list route above, this endpoint's real cache write happens in the ordinary
 * order — `await setCache(...)` BEFORE `res.json(...)` — preserved exactly.
 */
appTeamMembersRouter.get('/individual_details/:request_row_id', async (req, res) => {
  try {
    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
      const user_row_id = checkUserToken.message
      const request_row_id = Number.parseInt(req.params.request_row_id)

      const check_company_query = await companyM.findOne({ user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
      if (check_company_query) {
        if (check_company_query.approval_status == 1) {
          const company_row_id = check_company_query._id
          const key = `employee_details_${company_row_id}_${request_row_id}`

          const cache_response = await getCache({ key })
          if (cache_response.status) {
            return res.json({ status: true, message: cache_response.message, cache_response_status: true })
          }

          const result = await getEmployeeIndividualDetails({ company_row_id, request_row_id })

          if (result) {
            await setCache({ key, value: result, ttl: 1800 })
            res.json({ status: true, message: result, cache_response_status: false })
          } else {
            res.json({ status: false, message: { alert_message: 'Invalid Request row id' } })
          }
        } else {
          res.json({ status: false, message: { alert_message: 'Sorry, Your company is still not approved. Please wait for approval.' } })
        }
      } else {
        res.json({ status: false, message: { alert_message: 'Sorry, This user company does not exist.' } })
      }
    } else {
      res.json(checkUserToken)
    }
  } catch (err: any) {
    console.log('Individual employee details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
