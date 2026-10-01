// modules/professionals/professionals.controller.ts
//
// Phase A slice of the Professionals migration (see plan doc). Ports: /list,
// /admin_created_list, /create_new_user, /update_user, /enable_user, /disable_user,
// /years_overview, /overview, /users_pages, /public_status_list out of
// controllers/admin_panel/app/user.js. Mounted at a temporary `_v2` prefix
// (routes/admin_panel.js: '/users_v2') parallel to the untouched legacy '/users' mount, per
// the plan's confirmed cutover strategy — legacy stays live and unmodified until this module is
// verified via the characterization capture/compare cycle and real frontend testing.
//
// PERMISSION ID NORMALIZATION (confirmed decision, not a silent fix): every route in this module
// is gated with checkAdminLoginToken(req.headers, [1]), matching what the legacy file uses on
// every Phase A route in scope here. Two things found while reading the wider file are flagged,
// not silently changed:
//   - /user_followers/:user_row_id (user.js:1500) and /login_into_account/:user_row_id
//     (user.js:260) use access id [10] and [0] respectively — inconsistent with every other
//     route in the file (which use [1]). Neither route is in this Phase A slice's scope
//     (courtesy flag only, see the final report for this phase).
//   - GET /overview (user.js:466) has NO checkAdminLoginToken call at all in the legacy file —
//     not even an inconsistent id, just entirely open behind the global checkApiKey gate. This
//     module's /overview route below is gated with [1] like its /years_overview sibling, closing
//     that gap — a real behavior change, called out here and in the final report rather than
//     silently ported forward.
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { asyncRoute } from '../../../middleware/asyncRoute'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { getProfessionalList, getAdminCreatedList } from './professionals.list.service'
import { getYearsOverview, getOverview } from './professionals.overview.service'
import { getUsersPages, getPublicStatusList, createNewUser, updateUser } from './professionals.service'
// Enable/Disable now route through the pending -> approve -> publish gate (user-requested
// 2026-09-20) instead of writing live immediately — see professionals.lifecycle-request.service.ts.
import { submitEnableUserRequest, submitDisableUserRequest } from './professionals.lifecycle-request.service'
import { getProfessionalDetail, getProfessionalDetailBySlug } from './professionals.detail.service'
import { checkProfessionalNameForDuplicates } from './professionals.duplicate-check'
import { AdminAuthFailure } from './professionals.types'

export const professionalsRouter: Router = express.Router()

const PROFESSIONALS_ACCESS_IDS = [1]

function requireProfessionalsAdmin(req: Request): AdminAuthFailure | null {
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)
  return checkToken.status ? null : checkToken
}

// Router-level guard (additive safety net, matching company_admin.controller.ts's two-layer
// pattern): every route in this module needs the same [1] access id, so one router.use() plus
// each route's own per-route guard function/re-check both enforce it — a forgotten per-route
// check can't leave a route open.
//
// /disable_user is deliberately exempted here (matching company_admin.controller.ts's own
// documented exemption for /disable_company): the real /disable_user route accumulates an auth
// failure into the SAME errObj as the disable_reason validation error, so a solo auth failure
// returns `{status:false, message:{alert_message:<string>}}` — a different shape than
// checkAdminLoginToken's own `{status:false, message:<string>}`. A router-level short-circuit
// here would return the latter shape instead and silently drop a simultaneous validation error —
// changing the response shape, which CLAUDE.md requires flagging before doing. Left to the
// route's own per-route handling below instead.
const DISABLE_USER_PATH = /^\/disable_user\/[^/]+$/
professionalsRouter.use((req: Request, res: Response, next) => {
  if (DISABLE_USER_PATH.test(req.path)) return next()
  const checkToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)
  if (!checkToken.status) return res.json(checkToken)
  next()
})

professionalsRouter.get(
  '/list/:skip/:limit',
  asyncRoute('All Users list.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)

    const result = await getProfessionalList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      claimStatusRaw: req.query.claim_status as string,
      loginStatusRaw: req.query.login_status as string,
      approvalStatusRaw: req.query.approval_status as string,
      subAdminRowIdRaw: req.query.sub_admin_row_id as string,
      profileScoreRange: req.query.profile_score as string,
      designationStatusRaw: req.query.designation_status as string,
      lookingForStatusRaw: req.query.looking_for_status as string,
      sortByRaw: req.query.sort_by as string,
    })
    res.json(result)
  }),
)

professionalsRouter.get(
  '/admin_created_list/:skip/:limit',
  asyncRoute('Admin created users list.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)

    const result = await getAdminCreatedList({
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      profileScoreRange: req.query.profile_score as string,
    })
    res.json(result)
  }),
)

professionalsRouter.get(
  '/years_overview',
  asyncRoute('Users Overview.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    res.json(await getYearsOverview())
  }),
)

// CONFIRMED BUG FIX: legacy /overview has no admin-token gate at all (see file-header comment).
// Gated here with the same [1] access id as every sibling route.
professionalsRouter.get(
  '/overview',
  asyncRoute('Users Overview.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    res.json(await getOverview())
  }),
)

professionalsRouter.get(
  '/users_pages',
  asyncRoute('Users pages.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    res.json(await getUsersPages(req.query.search as string))
  }),
)

professionalsRouter.get(
  '/public_status_list/:user_row_id',
  asyncRoute('Public status list.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    res.json(await getPublicStatusList(req.params.user_row_id as string))
  }),
)

// Ports user.js's GET /single_details/:user_row_id (~2975-3437) — see professionals.detail.service.ts
// for the ~20-sequential-await -> two-Promise.all-rounds perf fix. Read-only GET, so (matching this
// module's existing convention of only rate-limiting mutating routes) no writeEndpointRateLimiter here.
professionalsRouter.get(
  '/single_details/:user_row_id',
  asyncRoute('User Individual details.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    res.json(await getProfessionalDetail(req.params.user_row_id as string))
  }),
)

// Admin panel's Professional View page, routed by the same `user_name` slug the public profile
// page uses (not the numeric row id) - see getProfessionalDetailBySlug's own doc comment.
professionalsRouter.get(
  '/single_details_by_slug/:user_name',
  asyncRoute('User Individual details by slug.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    res.json(await getProfessionalDetailBySlug(req.params.user_name as string))
  }),
)

/**
 * Advisory-only duplicate-name check for the admin "Create New Professional" form (user-requested,
 * 2026-09-22) - mirrors company_admin.controller.ts's own '/check_company_name' exactly, never
 * restricts creation, only surfaces exact/similar existing professionals so the admin can make an
 * informed call. `exclude_user_row_id` lets the same check run harmlessly while editing an
 * existing professional's own name without it matching itself.
 */
professionalsRouter.get(
  '/check_professional_name',
  asyncRoute('Check professional name for duplicates.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)

    const name = typeof req.query.name === 'string' ? req.query.name : ''
    const excludeUserRowId = typeof req.query.exclude_user_row_id === 'string' ? Number.parseInt(req.query.exclude_user_row_id) : undefined
    const result = await checkProfessionalNameForDuplicates(name, Number.isNaN(excludeUserRowId as number) ? undefined : excludeUserRowId)
    res.json({ status: true, message: result })
  }),
)

professionalsRouter.post(
  '/create_new_user',
  writeEndpointRateLimiter,
  [
    check('full_name').trim().not().isEmpty().withMessage('The Full Name field is required.').isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.').isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.'),
    check('user_name').trim().not().isEmpty().withMessage('The User Name field is required.').isLength({ min: 4 }).withMessage('The User Name field must be at least 4 characters.').isLength({ max: 120 }).withMessage('The User Name field must be less than 120 characters.'),
    check('designation_id').not().isEmpty().withMessage('The Designation Id field is required.'),
  ],
  asyncRoute('Create new user.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    const checkAdminToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)
    const errObj = arrangeValidation(validationResult(req))
    const result = await createNewUser({ admin: checkAdminToken, body: req.body, preValidationErrors: errObj })
    res.json(result)
  }),
)

professionalsRouter.post(
  '/update_user/:user_row_id',
  writeEndpointRateLimiter,
  [
    check('full_name').trim().not().isEmpty().withMessage('The Full Name field is required.').isLength({ min: 4 }).withMessage('The Full Name field must be at least 4 characters.').isLength({ max: 50 }).withMessage('The Full Name field must be less than 50 characters.'),
    check('user_name').trim().not().isEmpty().withMessage('The User Name field is required.').isLength({ min: 4 }).withMessage('The User Name field must be at least 4 characters.').isLength({ max: 120 }).withMessage('The User Name field must be less than 120 characters.'),
    check('designation_id').not().isEmpty().withMessage('The Designation Id field is required.'),
  ],
  asyncRoute('Update user details.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    const checkAdminToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)
    const errObj = arrangeValidation(validationResult(req))
    const result = await updateUser({ admin: checkAdminToken, userRowIdRaw: req.params.user_row_id as string, body: req.body, preValidationErrors: errObj })
    res.json(result)
  }),
)

professionalsRouter.get(
  '/enable_user/:user_row_id',
  writeEndpointRateLimiter,
  asyncRoute('Enable User.', async (req, res) => {
    const guard = requireProfessionalsAdmin(req)
    if (guard) return res.json(guard)
    const checkAdminToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)
    const result = await submitEnableUserRequest(checkAdminToken, req.params.user_row_id as string)
    res.json(result)
  }),
)

professionalsRouter.post(
  '/disable_user/:user_row_id',
  writeEndpointRateLimiter,
  [check('reason_for_disable').trim().not().isEmpty().withMessage('The Reason for Disabled field is required').isLength({ min: 4 }).withMessage('The Reason for Disabled field must be at least 4 characters in length.').isLength({ max: 200 }).withMessage('The Reason for Disabled field must be less than 200 characters in length.')],
  asyncRoute('Disable User.', async (req, res) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkAdminToken = checkAdminLoginToken(req.headers, PROFESSIONALS_ACCESS_IDS)
    if (!checkAdminToken.status) {
      // Matches the real route's accumulate-into-errObj pattern (see
      // company_admin.controller.ts's /disable_company for the same documented reasoning) rather
      // than a route-level early return, so a validation error AND an auth failure both surface
      // together instead of one silently masking the other.
      errObj['alert_message'] = checkAdminToken.message
    }
    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }
    const result = await submitDisableUserRequest(checkAdminToken, req.params.user_row_id as string, req.body.reason_for_disable)
    res.json(result)
  }),
)
