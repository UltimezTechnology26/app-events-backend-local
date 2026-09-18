// modules/company_admin/company_admin.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken, checkApiKey, checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import logger from '../../../config/logger'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import {
  getSubadminList,
  getCompanyEventsList,
  getYearsOverview,
  getNewCompanyYearsOverview,
  getSubadminOverview,
  enableCompany,
  disableCompany,
  bulkImportCompanies,
  updateCompanyPageDetails,
  checkUserOrCompanyIdAvailability,
} from './company_admin.service'
import { getCompanyOverview } from './company_admin.overview.service'
import { getCompanyIndividualOverview } from './company_admin.individual_overview.service'
import { getSeoOverview } from './company_admin.seo_overview.service'
import { getCompanyList } from './company_admin.list.service'
import { AdminAuthFailure } from './company_admin.types'
import { asyncRoute } from '../../../middleware/asyncRoute'

/**
 * Ports the admin-only, no-cross-module-overlap routes out of controllers/admin_panel/app/company.js
 * (Part 3 §7 Phase H step 1). Mounted at the real source's original prefix ('/company') to preserve
 * every existing admin-panel call site unchanged.
 */
export const companyAdminRouter: Router = express.Router()

// Additive safety net: route-level auth middleware mirroring each route's existing inline
// checkAdminLoginToken call. This file mixes admin_array values ([7] and [4]) across its
// routes, so a single router.use() would risk gating the [4]-only route (/subadmin_overview)
// with the wrong role set — hence one small wrapper per distinct role array, applied per route
// instead. Response shape on failure matches every existing handler's `res.json(checkToken)`
// convention exactly (status 200, the raw checkAdminLoginToken return value).
function requireAdmin7(req: Request): AdminAuthFailure | null {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  return checkToken.status ? null : checkToken
}

function requireAdmin4(req: Request): AdminAuthFailure | null {
  const checkToken = checkAdminLoginToken(req.headers, [4])
  return checkToken.status ? null : checkToken
}

// Router-level auth middleware (additive safety net — does not replace the per-route
// requireAdmin7/requireAdmin4 checks above, which still enforce the exact role each route
// needs). Every route in this file requires role 4 or 7 except GET /new_company_years_overview,
// which is confirmed dead code deliberately left checkApiKey-only (see that route's own comment)
// — explicitly exempted here rather than silently changing its access requirements.
companyAdminRouter.use((req: Request, res: Response, next) => {
  if (req.path === '/new_company_years_overview') return next()
  const checkToken = checkAdminLoginToken(req.headers, [4, 7])
  if (!checkToken.status) return res.json(checkToken)
  next()
})

/**
 * Merges the real source's GET /company_overview (checkApiKey only, 120s cache) and GET
 * /overview (checkAdminLoginToken [7], no cache) into one canonical handler at both paths
 * (Part 3 §7 Phase H.3, user-confirmed: require admin login on both — no caching, see
 * company_admin.overview.service.ts for why). CONFIRMED BUG FIX applied in the service:
 * user_total_deleted was computed against created_total_rejected instead of
 * created_total_deleted; and total_event_partners_sponsor (delegated to modules/partners/) now
 * ends in a real $count instead of a $group that only counted one company's own rows.
 */
const handleCompanyOverview = asyncRoute('Companies overview.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const message = await getCompanyOverview()
  res.json({ status: true, message })
})

companyAdminRouter.get('/company_overview', handleCompanyOverview)
companyAdminRouter.get('/overview', handleCompanyOverview)

// Phase H.4's /list + /disabled_list merge was reverted at the user's explicit request
// (2026-08-04) — kept as two separate routes, both delegating to the same
// activeStatus-parameterized getCompanyList (confirmed backward-compatible for both call
// shapes in company_admin.list.service.ts's own tests). Migrated here from
// controllers/admin_panel/app/company.js (completeness follow-up); that file is deleted.
companyAdminRouter.get('/list/:skip/:limit', asyncRoute('Companies list.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }
  const result = await getCompanyList({
    activeStatus: 1,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string,
    mainBusinessModelIdRaw: req.query.main_business_model_id as string,
    subAdminRowIdRaw: req.query.sub_admin_row_id as string,
    profileScoreRange: req.query.profile_score as string,
    createdDateOnlyRaw: req.query.created_date_n_time as string,
    createdStartDateRaw: req.query.created_start_date as string,
    createdEndDateRaw: req.query.created_end_date as string,
    claimStatusRaw: req.query.claim_status as string,
    categoryStatusRaw: req.query.category_status as string,
    sortBy: req.query.sort_by as string
  })
  res.json(result)
}))

// Trimmed to { status, message, count } to preserve this route's original response shape
// exactly — it never returned start_date/end_date (unlike /list above).
companyAdminRouter.get('/disabled_list/:skip/:limit', asyncRoute('Companies disabled list.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }
  const result = await getCompanyList({
    activeStatus: 0,
    skipRaw: req.params.skip as string,
    limitRaw: req.params.limit as string,
    search: req.query.search as string,
    mainBusinessModelIdRaw: req.query.main_business_model_id as string,
    subAdminRowIdRaw: req.query.sub_admin_row_id as string,
    profileScoreRange: req.query.profile_score as string,
    createdStartDateRaw: req.query.created_start_date as string,
    createdEndDateRaw: req.query.created_end_date as string,
    categoryStatusRaw: req.query.category_status as string,
    sortBy: req.query.sort_by as string
  })
  res.json({ status: result.status, message: result.message, count: result.count })
}))

/**
 * Ports company.js's GET /company_individual_overview/:company_row_id (Part 3 §7 Phase H.5) —
 * see company_admin.individual_overview.service.ts for the domain-delegation write-up.
 */
companyAdminRouter.get('/company_individual_overview/:company_row_id', asyncRoute('Company individual view.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getCompanyIndividualOverview({ companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

// CONFIRMED BUG FIX (pre-commit code-review pass): this was the only route in this file with
// no checkAdminLoginToken gate — every sibling route requires it, and this one returns the full
// sub-admin list without any admin token, an access-control gap dropped during the port.
companyAdminRouter.get('/subadmin_list', asyncRoute('Subadmin list.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }
  const result = await getSubadminList()
  res.json(result)
}))

companyAdminRouter.get('/company_events_list/:company_row_id', asyncRoute('Company events list.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getCompanyEventsList({ companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

// Not testable via any live UI — no caller found in either frontend during Phase H's research.
// Near-exact duplicate of years_overview below (same confirmed created_date_n_timee_n_time typo
// fixed in both), differing only in that this one caches for 120s and has no admin-token gate
// beyond the global checkApiKey. Ported and flagged per the standing "port dead code, don't drop
// it" decision — kept exactly at its original path in case an unseen consumer depends on it.
companyAdminRouter.get('/new_company_years_overview', checkApiKey, asyncRoute('Users Overview.', async (req, res) => {
  const result = await getNewCompanyYearsOverview()
  res.json(result)
}))

companyAdminRouter.get('/years_overview', asyncRoute('Users Overview.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getYearsOverview()
  res.json(result)
}))

companyAdminRouter.get('/subadmin_overview', asyncRoute('Company subadmin overview.', async (req, res) => {
  const guard = requireAdmin4(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [4])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await getSubadminOverview()
  res.json(result)
}))

companyAdminRouter.get('/enable_company/:company_row_id', writeEndpointRateLimiter, asyncRoute('Enable company.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await enableCompany({ admin: checkToken, companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

// Not given a route-level requireAdmin7 gate: this handler accumulates the admin-token failure
// into the same errObj as the disable_reason validation error (`errObj['alert_message'] =
// checkToken.message`), so a solo auth failure here returns `{status:false,
// message:{alert_message: <string>}}` — a different shape than checkAdminLoginToken's own
// `{status:false, message: <string>}`. A route-level middleware short-circuiting before the
// check() validators run would also silently drop the validation error in the both-invalid
// case. Left untouched (still a hard reject in practice, just via the accumulate-errors path)
// to avoid changing the response shape — matches the same reasoning already documented for
// company.settings.controller.ts's /update_basic_company_details.
companyAdminRouter.post(
  '/disable_company/:company_row_id',
  writeEndpointRateLimiter,
  [check('disable_reason').trim().not().isEmpty().withMessage('The Reason Disabled field is required').isLength({ min: 4 }).withMessage('The Reason Disabled field must be at least 4 characters.')],
  asyncRoute('Disable company.', async (req, res) => {
    const errObj = arrangeValidation(validationResult(req))
    const checkToken = checkAdminLoginToken(req.headers, [7])
    if (!checkToken.status) {
      errObj['alert_message'] = checkToken.message
    }

    if (Object.keys(errObj).length > 0) {
      res.json({ status: false, message: errObj })
      return
    }

    const result = await disableCompany({ admin: checkToken, companyRowIdRaw: req.params.company_row_id as string, disableReason: req.body.disable_reason })
    res.json(result)
  }),
)

companyAdminRouter.post('/company_bulk_data', writeEndpointRateLimiter, asyncRoute('Company bulk data.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const result = await bulkImportCompanies({ admin: checkToken, bulkData: req.body.bulk_data })
  res.json(result)
}))

/**
 * Ports company.js's POST /update_company_page_details/:company_row_id (Part 3 §7 Phase H.6) —
 * see company_admin.service.ts's updateCompanyPageDetails for the domain-delegation write-up
 * and the confirmed company_other_detailsM ReferenceError crash fix.
 */
companyAdminRouter.post(
  '/update_company_page_details/:company_row_id',
  writeEndpointRateLimiter,
  [
    check('company_name')
      .trim()
      .not()
      .isEmpty()
      .withMessage('The Company Name field is required.')
      .isLength({ min: 4 })
      .withMessage('The Company Name field must be at least 4 characters.')
      .isLength({ max: 120 })
      .withMessage('The Company Name field must be less than 120 characters.'),
    check('company_id')
      .trim()
      .not()
      .isEmpty()
      .withMessage('The Company Id field is required.')
      .isLength({ min: 4 })
      .withMessage('The Company Id field must be at least 4 characters.')
      .isLength({ max: 40 })
      .withMessage('The Company Id field must be less than 40 characters.')
      .matches(/^[a-zA-Z0-9-]+$/)
      .withMessage('Company ID must contain only alphabets, numbers, and hyphen.'),
    check('describe_in_one_line')
      .trim()
      .not()
      .isEmpty()
      .withMessage('The Describe in One Line field is required.')
      .isLength({ min: 4 })
      .withMessage('The Describe in One Line field must be at least 4 characters.')
      .isLength({ max: 120 })
      .withMessage('The Describe in One Line field must be less than 120 characters.'),
    check('business_model_id').not().isEmpty().withMessage('The Business Model Id field is required.'),
  ],
  asyncRoute('Update company page details.', async (req, res) => {
    const guard = requireAdmin7(req)
    if (guard) return res.json(guard)
    const checkAdminToken = checkAdminLoginToken(req.headers, [7])
    if (!checkAdminToken.status) {
      res.json(checkAdminToken)
      return
    }

    const errObj = arrangeValidation(validationResult(req))
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await updateCompanyPageDetails({
      admin: checkAdminToken,
      actor,
      companyRowIdRaw: req.params.company_row_id as string,
      body: req.body,
      preValidationErrors: errObj,
    })
    res.json(result)
  }),
)

/**
 * Ports company.js's GET /seo_overview (Part 3 §7 Phase H step 7) — see
 * company_admin.seo_overview.service.ts for the confirmed ReferenceError crash fix.
 *
 * CONFIRMED BUG FIX: the real source gated this route with `checkApiKey` only — no admin-token
 * check at all — despite admin-coinpedia's own proxy (`pages/api/seo_details/company_dashboard.js`)
 * already forwarding the admin's login token on every call, and this being the exact same
 * dashboard page (`pages/companies/overview.js`) whose sibling `company_overview`/`overview`
 * endpoints were already confirmed to need `checkAdminLoginToken` in Phase H.3. Same fix applied
 * here for consistency, not a fresh judgment call.
 */
// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #13.
companyAdminRouter.get('/seo_overview', async (req: Request, res: Response) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const message = await getSeoOverview()
    res.json({ status: true, message })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`SEO Overview Error: ${message}`)
    res.status(500).json({ status: false, message: 'Internal Server Error'})
  }
})

/**
 * Ports company.js's GET /check_user_company_id/:investor_type/:id (Part 3 §7 Phase H step 10) —
 * confirmed unreachable, given a real home here per the Build Order (no existing equivalent
 * anywhere else). See company_admin.service.ts's checkUserOrCompanyIdAvailability for the
 * confirmed "comapany_id" typo fix.
 *
 * CONFIRMED BUG FIX: the real source had no admin-token check at all — the only route in the
 * whole file without one. Gated here with the same checkAdminLoginToken([7]) every other route
 * in this module uses.
 */
companyAdminRouter.get('/check_user_company_id/:investor_type/:id', asyncRoute('Check user and company.', async (req, res) => {
  const guard = requireAdmin7(req)
  if (guard) return res.json(guard)
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  const investor_type = Number.parseInt(req.params.investor_type as string)
  const result = await checkUserOrCompanyIdAvailability({ investor_type, id: req.params.id as string })
  res.json(result)
}))
