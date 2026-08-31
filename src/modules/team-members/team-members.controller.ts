// modules/team-members/team-members.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, param, validationResult } = require('express-validator')
const { checkUserLoginToken, checkAllLoginToken, checkAdminLoginToken, requireAdminAccess } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
const companyM = require('../../../models/app/company/companyM')
import { createOrUpdateEmployeeDetails, adminCreateOrUpdateEmployeeDetails, removeEmployee, approveEmployeeRequest, adminRemoveEmployee, adminApproveEmployeeRequest } from './team-members.service'
import { getEmployeeList, getEmployeeIndividualDetails, getAdminEmployeeList, getAdminCompanyEmployeeList, getManualCompanyEmployeeList, getEmployeeSuggestions } from './team-members.queries'
import { getCache, setCache } from './team-members.cache'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'

/**
 * Two separate routers (not one shared router branching on user type), matching the pattern
 * established by work-experience.controller.ts: the app and admin paths are genuinely distinct
 * handler functions with distinct validators, auth checks, and response shapes. Both register at
 * the SAME internal path per route — routes/app.js and routes/admin_panel.js do the external
 * mounting (not done here).
 */
export const appTeamMembersRouter: Router = express.Router()
export const adminTeamMembersRouter: Router = express.Router()

// Additive safety net for appTeamMembersRouter (the admin router above already has its own
// blanket requireAdminAccess([7])). This router mixes checkAllLoginToken([7]) and
// checkUserLoginToken across its routes with no single shared shape, so it's gated per route.

// Matches /update_employee_details's `else { res.json({ status: false, message:
// checkUserToken?.message }) }` — structurally identical to returning checkUserToken directly,
// since checkUserToken is already `{status:false, message:{...}}`.
async function requireAllLogin7(req: Request): Promise<{ status: false; message: unknown } | null> {
  const checkUserToken = await checkAllLoginToken(req.headers, [7])
  return checkUserToken.status ? null : { status: false, message: checkUserToken?.message }
}

// Matches /list and /individual_details's `else { res.json(checkUserToken) }`.
function requireUserLogin(req: Request): { status: false; message: unknown } | null {
  const checkUserToken = checkUserLoginToken(req.headers)
  return checkUserToken.status ? null : checkUserToken
}

// Additive safety net: every route in this admin router requires checkAdminLoginToken(req.headers, [7]).
// Registered immediately (before any route handlers) so it applies to every route below,
// regardless of definition order. Existing per-handler checks are left in place unchanged.
adminTeamMembersRouter.use(requireAdminAccess([7]))

/**
 * Ports controllers/app/company/employee.js's POST /update_employee_details (lines ~21-238).
 * Auth uses checkAllLoginToken (awaited), unlike the sibling GET routes below which use
 * checkUserLoginToken — this is a real, preserved divergence from the real source, not a typo.
 * On auth failure the real source does a bare passthrough of `checkUserToken.message` (NOT wrapped
 * in `{ alert_message }`) — preserved exactly.
 */
appTeamMembersRouter.post('/update_employee_details', writeEndpointRateLimiter, [
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
], asyncRoute('Update employee details.', async (req, res) => {
  const guard = await requireAllLogin7(req)
  if (guard) return res.json(guard)

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
}))

/**
 * Ports controllers/admin_panel/app/company_employees.js's POST /update_employee_details
 * (lines ~16-231). Auth uses checkAdminLoginToken — NOT awaited (it's synchronous), unlike the
 * app route's awaited checkAllLoginToken above. On auth failure the real source does a raw
 * passthrough of the whole `checkToken` object — preserved exactly.
 */
adminTeamMembersRouter.post('/update_employee_details', writeEndpointRateLimiter, [
  check('employment_type')
    .trim().not().isEmpty().withMessage('The Employment Type field is required.')
    .isInt({ min: 1, max: 5 }).withMessage('The Employment Type field must be contains only integers.'),
  check('designation_type')
    .trim().not().isEmpty().withMessage('The Designation Type field is required.')
], asyncRoute('Update employee details.', async (req, res) => {
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
}))

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
appTeamMembersRouter.get('/list/:skip/:limit', asyncRoute('Employee list.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const checkUserToken = checkUserLoginToken(req.headers)
  if (checkUserToken.status) {
    const user_row_id = checkUserToken.message
    const check_company_query = await companyM.findOne({ user_row_id, active_status: 1 }, { _id: 1, approval_status: 1 })
    if (check_company_query) {
      if (check_company_query.approval_status == 1) {
        const company_row_id = check_company_query._id
        const limit = Number.parseInt(req.params.limit as string)
        const skip = Number.parseInt(req.params.skip as string)
        const key = `employee_list_${company_row_id}_${skip}_${limit}_${req.query.search || ''}`

        const cache_response = await getCache<{ get_query: unknown[]; counts: unknown }>({ key })
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
}))

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET /list/:skip/:limit
 * (lines ~654-942). No company scoping (admin sees every company) and no caching at all, matching
 * the real source. The response leaks the raw `query` filter array as a 3rd top-level field —
 * preserved verbatim, not something to "clean up" here.
 */
adminTeamMembersRouter.get('/list/:skip/:limit', asyncRoute('Employees list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (checkToken.status) {
    const limit = Number.parseInt(req.params.limit as string)
    const skip = Number.parseInt(req.params.skip as string)

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
}))

/**
 * Ports controllers/app/company/employee.js's GET /individual_details/:request_row_id
 * (lines ~708-916). App-only — admin has no equivalent route. Company resolution stays a
 * controller-layer concern, same as the list route above.
 *
 * Caching: unlike the list route above, this endpoint's real cache write happens in the ordinary
 * order — `await setCache(...)` BEFORE `res.json(...)` — preserved exactly.
 */
appTeamMembersRouter.get('/individual_details/:request_row_id', asyncRoute('Individual employee details.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const checkUserToken = checkUserLoginToken(req.headers)
  if (checkUserToken.status) {
    const user_row_id = checkUserToken.message
    const request_row_id = Number.parseInt(req.params.request_row_id as string)

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
}))

/**
 * Ports controllers/app/company/employee.js's GET /remove_employee/:request_row_id
 * (lines 17-60) — company resolution + approval check stay inside
 * removeEmployee() itself (Part 3 §7 Phase B step 5), matching the write-path
 * convention already used by createOrUpdateEmployeeDetails above, not the
 * controller-resolves-company convention used by the read-only list/
 * individual_details routes (those need company_row_id for other purposes
 * before calling the query layer; this route doesn't).
 *
 * Phase B step 7 (confirmed scope — public read endpoints in modules/company/
 * stay untouched, this is specifically a write/action endpoint): auth upgraded
 * from checkUserLoginToken to checkAllLoginToken(headers, [7]), matching
 * update_employee_details' already-established pattern in this exact file
 * (was the older employee.js-era auth, now standardized); rate-limited via
 * writeEndpointRateLimiter; request_row_id validated via express-validator
 * instead of relying on Number.parseInt's implicit NaN-is-harmless behavior.
 *
 * Not given the requireAllLogin7 route-level gate: unlike update_employee_details, this handler
 * checks param validation FIRST and short-circuits before ever computing auth — so when both are
 * invalid, today's response is the validation error, not the auth one. Adding the middleware
 * ahead of the param() validator would flip that precedence, a real behavior change.
 */
appTeamMembersRouter.get('/remove_employee/:request_row_id', writeEndpointRateLimiter, [
  param('request_row_id')
    .isInt({ min: 1 }).withMessage('The request row id field must be a positive integer.')
], asyncRoute('Remove employee.', async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.json({ status: false, message: arrangeValidation(errors) })
  }

  const checkUserToken = await checkAllLoginToken(req.headers, [7])
  if (checkUserToken.status) {
    const company_owner_user_row_id = checkUserToken.message?.user_row_id
    const request_row_id = Number.parseInt(req.params.request_row_id as string)

    const result = await removeEmployee({ company_owner_user_row_id, request_row_id })
    res.json(result)
  } else {
    res.json({ status: false, message: checkUserToken?.message })
  }
}))

/**
 * Ports controllers/app/company/employee.js's GET /approve_request/:request_row_id
 * (lines 62-118) — same rationale and same Phase B step 7 changes as
 * remove_employee above.
 *
 * Not given the requireAllLogin7 route-level gate: same validation-before-auth ordering as
 * remove_employee above — see that route's comment.
 */
appTeamMembersRouter.get('/approve_request/:request_row_id', writeEndpointRateLimiter, [
  param('request_row_id')
    .isInt({ min: 1 }).withMessage('The request row id field must be a positive integer.')
], asyncRoute('Approve employee request.', async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.json({ status: false, message: arrangeValidation(errors) })
  }

  const checkUserToken = await checkAllLoginToken(req.headers, [7])
  if (checkUserToken.status) {
    const company_owner_user_row_id = checkUserToken.message?.user_row_id
    const request_row_id = Number.parseInt(req.params.request_row_id as string)

    const result = await approveEmployeeRequest({ company_owner_user_row_id, request_row_id })
    res.json(result)
  } else {
    res.json({ status: false, message: checkUserToken?.message })
  }
}))

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET
 * /company_list/:company_row_id/:skip/:limit (Part 3 §7 Phase H step 8) — confirmed LIVE via
 * admin-coinpedia's pages/api/companies/manage_companies/team_members/list.js, itself called from
 * components/company/manage_company/team_details.js (the "Team" tab on a company's admin detail
 * page). Param parsing matches the real source exactly (no NaN guard) — Number.parseInt on a
 * non-numeric segment yields NaN, which Mongo simply matches nothing against, same real behavior
 * as before this port.
 */
adminTeamMembersRouter.get('/company_list/:company_row_id/:skip/:limit', asyncRoute('Companies list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (checkToken.status) {
    const company_row_id = Number.parseInt(req.params.company_row_id as string)
    const limit = Number.parseInt(req.params.limit as string)
    const skip = Number.parseInt(req.params.skip as string)

    const { get_query, counts } = await getAdminCompanyEmployeeList({
      company_row_id,
      skip,
      limit,
      search: req.query.search as string | undefined
    })

    res.json({ status: true, message: get_query, counts })
  } else {
    res.json(checkToken)
  }
}))

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET
 * /remove_employee/:request_row_id (Part 3 §7 Phase H step 8) — confirmed LIVE via 3 callers
 * (admin-coinpedia's manage_employees/approved.js, team_members/remove.js, remove_user.js). The
 * real source's request_row_id NaN guard is a controller-layer concern (predates
 * removeEmployee/approveEmployeeRequest's own express-validator convention above) — preserved
 * inline exactly as it always was, rather than retrofitted onto express-validator.
 */
adminTeamMembersRouter.get('/remove_employee/:request_row_id', asyncRoute('Remove Employee.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (checkToken.status) {
    const request_row_id = Number.parseInt(req.params.request_row_id as string)
    if (!Number.isNaN(request_row_id)) {
      const result = await adminRemoveEmployee({ admin_context: checkToken, request_row_id })
      res.json(result)
    } else {
      res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
    }
  } else {
    res.json(checkToken)
  }
}))

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET
 * /approve_request/:request_row_id (Part 3 §7 Phase H step 8) — confirmed LIVE via 3 callers
 * (admin-coinpedia's manage_employees/pending.js, team_members/approve.js, employee_verify.js).
 */
adminTeamMembersRouter.get('/approve_request/:request_row_id', asyncRoute('Approve Employees request.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (checkToken.status) {
    const request_row_id = Number.parseInt(req.params.request_row_id as string)
    if (!Number.isNaN(request_row_id)) {
      const result = await adminApproveEmployeeRequest({ admin_context: checkToken, request_row_id })
      res.json(result)
    } else {
      res.json({ status: false, message: { alert_message: 'Sorry, Invalid Request row id' } })
    }
  } else {
    res.json(checkToken)
  }
}))

/**
 * Ports controllers/admin_panel/app/company_employees.js's GET /suggestions/:user_name and GET
 * /manual_company_list/:company_row_id/:skip/:limit (Part 3 §7 Phase H step 8) — both confirmed
 * UNREACHABLE (no caller anywhere across admin-coinpedia, frontend-appcp-typescript, or
 * frontend-events-typescript — the real source's own comment even marks this section "old not
 * used code"). Ported verbatim per the standing "port dead code, flag it, don't drop it"
 * convention; fate deferred to the FINAL PHASE like every other flagged-dead route this
 * engagement.
 */
// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #12.
adminTeamMembersRouter.get('/suggestions/:user_name', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (checkToken.status) {
    try {
      const list = await getEmployeeSuggestions(req.params.user_name)
      res.json({ status: true, message: list })
    } catch (err: unknown) {
      res.json({ status: false, message: err })
    }
  } else {
    res.json(checkToken)
  }
})

adminTeamMembersRouter.get('/manual_company_list/:company_row_id/:skip/:limit', asyncRoute('Manual Companies employee list.', async (req, res) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (checkToken.status) {
    const company_row_id = Number.parseInt(req.params.company_row_id as string)
    const limit = Number.parseInt(req.params.limit as string)
    const skip = Number.parseInt(req.params.skip as string)

    const { get_query, counts } = await getManualCompanyEmployeeList({ company_row_id, skip, limit })

    res.json({ status: true, message: get_query, counts })
  } else {
    res.json(checkToken)
  }
}))
