// modules/company_admin/company_admin.controller.ts
import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const { checkAdminLoginToken, checkApiKey, checkAllLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
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

/**
 * Ports the admin-only, no-cross-module-overlap routes out of controllers/admin_panel/app/company.js
 * (Part 3 §7 Phase H step 1). Mounted at the real source's original prefix ('/company') to preserve
 * every existing admin-panel call site unchanged.
 */
export const companyAdminRouter: Router = express.Router()

/**
 * Merges the real source's GET /company_overview (checkApiKey only, 120s cache) and GET
 * /overview (checkAdminLoginToken [7], no cache) into one canonical handler at both paths
 * (Part 3 §7 Phase H.3, user-confirmed: require admin login on both — no caching, see
 * company_admin.overview.service.ts for why). CONFIRMED BUG FIX applied in the service:
 * user_total_deleted was computed against created_total_rejected instead of
 * created_total_deleted; and total_event_partners_sponsor (delegated to modules/partners/) now
 * ends in a real $count instead of a $group that only counted one company's own rows.
 */
async function handleCompanyOverview(req: Request, res: Response) {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const message = await getCompanyOverview()
    res.json({ status: true, message })
  } catch (err: any) {
    console.log('Companies overview.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
}

companyAdminRouter.get('/company_overview', handleCompanyOverview)
companyAdminRouter.get('/overview', handleCompanyOverview)

// Phase H.4's /list + /disabled_list merge was reverted at the user's explicit request
// (2026-08-04) — kept as two separate routes, both delegating to the same
// activeStatus-parameterized getCompanyList (confirmed backward-compatible for both call
// shapes in company_admin.list.service.ts's own tests). Migrated here from
// controllers/admin_panel/app/company.js (completeness follow-up); that file is deleted.
companyAdminRouter.get('/list/:skip/:limit', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }
  try {
    const result = await getCompanyList({
      activeStatus: 1,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      mainBusinessModelIdRaw: req.query.main_business_model_id as string,
      subAdminRowIdRaw: req.query.sub_admin_row_id as string,
      profileScoreRange: req.query.profile_score as string,
      createdDateOnlyRaw: req.query.created_date_n_time as string,
      claimStatusRaw: req.query.claim_status as string,
      categoryStatusRaw: req.query.category_status as string
    })
    res.json(result)
  }
  catch (err: any) {
    console.log('Companies list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// Trimmed to { status, message, count } to preserve this route's original response shape
// exactly — it never returned start_date/end_date (unlike /list above).
companyAdminRouter.get('/disabled_list/:skip/:limit', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }
  try {
    const result = await getCompanyList({
      activeStatus: 0,
      skipRaw: req.params.skip as string,
      limitRaw: req.params.limit as string,
      search: req.query.search as string,
      profileScoreRange: req.query.profile_score as string,
      categoryStatusRaw: req.query.category_status as string
    })
    res.json({ status: result.status, message: result.message, count: result.count })
  }
  catch (err: any) {
    console.log('Companies disabled list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

/**
 * Ports company.js's GET /company_individual_overview/:company_row_id (Part 3 §7 Phase H.5) —
 * see company_admin.individual_overview.service.ts for the domain-delegation write-up.
 */
companyAdminRouter.get('/company_individual_overview/:company_row_id', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await getCompanyIndividualOverview({ companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Company individual view.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// CONFIRMED BUG FIX (pre-commit code-review pass): this was the only route in this file with
// no checkAdminLoginToken gate — every sibling route requires it, and this one returns the full
// sub-admin list without any admin token, an access-control gap dropped during the port.
companyAdminRouter.get('/subadmin_list', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }
  try {
    const result = await getSubadminList()
    res.json(result)
  } catch (err: any) {
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyAdminRouter.get('/company_events_list/:company_row_id', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await getCompanyEventsList({ companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Company events list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// Not testable via any live UI — no caller found in either frontend during Phase H's research.
// Near-exact duplicate of years_overview below (same confirmed created_date_n_timee_n_time typo
// fixed in both), differing only in that this one caches for 120s and has no admin-token gate
// beyond the global checkApiKey. Ported and flagged per the standing "port dead code, don't drop
// it" decision — kept exactly at its original path in case an unseen consumer depends on it.
companyAdminRouter.get('/new_company_years_overview', checkApiKey, async (req: Request, res: Response) => {
  try {
    const result = await getNewCompanyYearsOverview()
    res.json(result)
  } catch (err: any) {
    console.log('Users Overview.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companyAdminRouter.get('/years_overview', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await getYearsOverview()
    res.json(result)
  } catch (err: any) {
    console.log('Users Overview.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
  }
})

companyAdminRouter.get('/subadmin_overview', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [4])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await getSubadminOverview()
    res.json(result)
  } catch (err: any) {
    console.log('Company subadmin overview.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyAdminRouter.get('/enable_company/:company_row_id', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await enableCompany({ admin: checkToken, companyRowIdRaw: req.params.company_row_id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Enable company.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

companyAdminRouter.post(
  '/disable_company/:company_row_id',
  [check('disable_reason').trim().not().isEmpty().withMessage('The Reason Disabled field is required').isLength({ min: 4 }).withMessage('The Reason Disabled field must be at least 4 characters.')],
  async (req: Request, res: Response) => {
    try {
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
    } catch (err: any) {
      console.log('Disable company.', err.message)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
    }
  },
)

companyAdminRouter.post('/company_bulk_data', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const result = await bulkImportCompanies({ admin: checkToken, bulkData: req.body.bulk_data })
    res.json(result)
  } catch (err: any) {
    console.log('Company bulk data.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Ports company.js's POST /update_company_page_details/:company_row_id (Part 3 §7 Phase H.6) —
 * see company_admin.service.ts's updateCompanyPageDetails for the domain-delegation write-up
 * and the confirmed company_other_detailsM ReferenceError crash fix.
 */
companyAdminRouter.post(
  '/update_company_page_details/:company_row_id',
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
  async (req: Request, res: Response) => {
    try {
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
    } catch (err: any) {
      console.log('Update company page details.', err.message)
      res.json({ status: false, message: 'An unexpected error occurred. Please try again later.'})
    }
  },
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
companyAdminRouter.get('/seo_overview', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const message = await getSeoOverview()
    res.json({ status: true, message })
  } catch (err: any) {
    console.error('SEO Overview Error:', err)
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
companyAdminRouter.get('/check_user_company_id/:investor_type/:id', async (req: Request, res: Response) => {
  const checkToken = checkAdminLoginToken(req.headers, [7])
  if (!checkToken.status) {
    res.json(checkToken)
    return
  }

  try {
    const investor_type = Number.parseInt(req.params.investor_type as string)
    const result = await checkUserOrCompanyIdAvailability({ investor_type, id: req.params.id as string })
    res.json(result)
  } catch (err: any) {
    console.log('Check user and company.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})
