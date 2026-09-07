// modules/company/company.settings.controller.ts
import express, { Router, Request, Response } from 'express'
const { validationResult } = require('express-validator')
const { checkUserLoginToken, checkAllLoginToken, verifyEmailTempToken, checkApiKey } = require('../../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import logger from '../../../../config/logger'
import { writeEndpointRateLimiter } from '../../../../middleware/rateLimiter'
import { asyncRoute } from '../../../../middleware/asyncRoute'
import {
  saveOrUpdateBasicCompanyDetails,
  saveOrUpdateBasicCompanyDetailsTeamPanel,
  saveOrUpdateSocialDetails,
  saveOrUpdateSocialMediaDetailsTeamPanel,
  getIndividualDetails,
  getIndividualDetailsTeamPanel,
  updateCompanyLogo,
  removeCompanyLogo,
  followCompany,
  unfollowCompany,
  removeFollower,
  getCompanyFollowersList,
  getCompanyWalletAddressList,
  addCompanyWalletAddress,
  verifyCompanyEmailOtp,
  sendEmailOtp,
  updateCompanySeo,
  getCompanySeo,
} from './company.settings.service'
import {
  updateBasicCompanyDetailsValidation,
  updateNewBasicCompanyDetailsValidation,
  updateSocialDetailsValidation,
  updateSocialMediaDetailsValidation,
  addCompanyWalletAddressValidation,
  verifyCompanyEmailOtpValidation,
  updateCompanySeoValidation,
} from './company.settings.validation'

/**
 * Ports controllers/app/company/setting.js's 19 routes (Part 3 §7 Phase G step 1) — folded
 * into modules/company/ rather than a new module, per the user's explicit direction (mounted
 * at the same '/company/setting' path prefix to preserve every existing frontend call site
 * unchanged). 2 dead, fully-commented-out routes (remove_company_wallet, remove_podcast_id)
 * are not ported — there was no live logic to carry forward.
 */
export const companySettingsRouter: Router = express.Router()

// Router-level auth middleware (additive safety net — does not replace any of the per-route
// checks below). This file mixes checkAllLoginToken([7]) and checkUserLoginToken hard gates, so
// the gate here accepts either (whichever any given route actually enforces more specifically).
// Explicitly exempted, matching existing documented behavior exactly:
//  - /update_basic_company_details and /verify_company_email_otp: deliberately soft/
//    accumulate-errors routes that must stay reachable even when auth fails (see their own
//    comments below) — gating them here would change their response shape.
//  - /update_new_basic_company_details and /individual_company_details/:user_row_id: already
//    gated by real route-level `checkApiKey` middleware, a different mechanism than the two
//    checks below.
//  - /company_followers/:company_row_id: intentionally public (listing a company's followers
//    carries no auth check anywhere in this file today) — not newly gated here.
//  - /update_social_media_details: has no auth check anywhere today either, unlike every other
//    write route in this file — exempted here to preserve current behavior exactly rather than
//    silently gating a route that was never gated; flagged separately for sign-off since this
//    looks like a genuine pre-existing gap, not a documented deliberate choice like the others.
const SETTINGS_ROUTER_EXEMPT_PATHS = [
  '/update_basic_company_details',
  '/verify_company_email_otp',
  '/update_new_basic_company_details',
  '/individual_company_details',
  '/company_followers',
  '/update_social_media_details',
]
companySettingsRouter.use(async (req: Request, res: Response, next) => {
  if (SETTINGS_ROUTER_EXEMPT_PATHS.some((path) => req.path.startsWith(path))) return next()
  const viaUserLogin = checkUserLoginToken(req.headers)
  if (viaUserLogin.status) return next()
  const viaAllLogin7 = await checkAllLoginToken(req.headers, [7])
  if (viaAllLogin7.status) return next()
  return res.json(viaUserLogin)
})

// Additive safety net wrappers. This file mixes checkAllLoginToken([7]) hard gates,
// checkUserLoginToken hard gates, checkApiKey (already route-level), and one deliberately
// soft/accumulate-errors route — so no blanket router.use(). One wrapper per distinct
// (authFunction, response-shape-on-failure) pair actually used below.

// Used where the service does `if (!actor.status) return actor` — response on failure is the
// raw checkAllLoginToken return value, matching every one of those handlers' `res.json(result)`
// where result === actor.
async function requireAllLogin7(req: Request): Promise<{ status: false; message: any } | null> {
  const actor = await checkAllLoginToken(req.headers, [7])
  return actor.status ? null : actor
}

// Used only for /update_social_details — see docs/error-handling-exceptions.md #8.
async function requireAllLogin7SocialDetails(req: Request): Promise<{ status: false; message: any } | null> {
  const actor = await checkAllLoginToken(req.headers, [7])
  return actor.status ? null : { status: false, message: { alert_message: actor.message, test: 'dsaf' } }
}

// Used where the service does `if (!checkUserToken.status) return checkUserToken` — response on
// failure is the raw checkUserLoginToken return value.
function requireUserLogin(req: Request): { status: false; message: any } | null {
  const checkUserToken = checkUserLoginToken(req.headers)
  return checkUserToken.status ? null : checkUserToken
}

// NOT given a route-level gate: /update_basic_company_details deliberately does NOT reject on
// auth failure (see saveOrUpdateBasicCompanyDetails's own comment) — the real legacy source
// falls through to business_model_id/regularities_details validation regardless of auth status,
// only using `actor.status` to decide whether to also validate the caller's own profile/company
// row. A hard gate here would reject requests the existing handler intentionally lets through.
// Also NOT gated: /verify_company_email_otp, which merges the verifyEmailTempToken failure into
// the same errObj as body-validation errors (accumulate pattern, not a pure early reject) —
// gating it here would return only the auth error and drop validation errors in the
// both-invalid case, changing the combined response shape.
companySettingsRouter.post('/update_basic_company_details', writeEndpointRateLimiter, updateBasicCompanyDetailsValidation, asyncRoute('Update company details.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const actor = await checkAllLoginToken(req.headers, [7])
  const result = await saveOrUpdateBasicCompanyDetails({ actor, body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

// without token api for team
companySettingsRouter.post('/update_new_basic_company_details', writeEndpointRateLimiter, checkApiKey, updateNewBasicCompanyDetailsValidation, asyncRoute('Update company details.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const result = await saveOrUpdateBasicCompanyDetailsTeamPanel({ body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #8.
companySettingsRouter.post('/update_social_details', writeEndpointRateLimiter, updateSocialDetailsValidation, async (req: Request, res: Response) => {
  try {
    const guard = await requireAllLogin7SocialDetails(req)
    if (guard) return res.json(guard)
    const actor = await checkAllLoginToken(req.headers, [7])
    const errObj = arrangeValidation(validationResult(req))
    const result = await saveOrUpdateSocialDetails({ actor, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: unknown) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

// without token api for team panel
// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #9.
companySettingsRouter.post('/update_social_media_details', writeEndpointRateLimiter, updateSocialMediaDetailsValidation, async (req: Request, res: Response) => {
  try {
    const errObj = arrangeValidation(validationResult(req))
    const result = await saveOrUpdateSocialMediaDetailsTeamPanel({ body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: unknown) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

companySettingsRouter.get('/individual_details', asyncRoute('Company details.', async (req, res) => {
  const guard = await requireAllLogin7(req)
  if (guard) return res.json(guard)
  const actor = await checkAllLoginToken(req.headers, [7])
  const result = await getIndividualDetails({
    actor,
    queryCompanyRowId: req.query.company_row_id as string | undefined,
    includePendingOverlay: req.query.include_pending_overlay === 'true',
  })
  res.json(result)
}))

// without login token api for team panel
companySettingsRouter.get('/individual_company_details/:user_row_id', checkApiKey, asyncRoute('Company details.', async (req, res) => {
  const result = await getIndividualDetailsTeamPanel({ queryCompanyRowId: req.query.company_row_id as string | undefined })
  res.json(result)
}))

companySettingsRouter.post('/update_company_logo', writeEndpointRateLimiter, asyncRoute('Update company logo.', async (req, res) => {
  const guard = await requireAllLogin7(req)
  if (guard) return res.json(guard)
  const actor = await checkAllLoginToken(req.headers, [7])
  const result = await updateCompanyLogo({ actor, body: req.body })
  res.json(result)
}))

companySettingsRouter.get('/remove_company_logo', asyncRoute('Update company logo.', async (req, res) => {
  const guard = await requireAllLogin7(req)
  if (guard) return res.json(guard)
  const actor = await checkAllLoginToken(req.headers, [7])
  const result = await removeCompanyLogo({ actor, queryCompanyRowId: req.query.company_row_id })
  res.json(result)
}))

companySettingsRouter.get('/follow/:following_company_row_id', asyncRoute('Follow company.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const checkUserToken = checkUserLoginToken(req.headers)
  const result = await followCompany({ checkUserToken, followingCompanyRowIdRaw: req.params.following_company_row_id as string })
  res.json(result)
}))

companySettingsRouter.get('/unfollow/:following_company_row_id', asyncRoute('Unfollow company.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const checkUserToken = checkUserLoginToken(req.headers)
  const result = await unfollowCompany({ checkUserToken, followingCompanyRowIdRaw: req.params.following_company_row_id as string })
  res.json(result)
}))

companySettingsRouter.get('/remove_follower/:follower_user_row_id', asyncRoute('Remove Follower.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const checkUserToken = checkUserLoginToken(req.headers)
  const result = await removeFollower({ checkUserToken, followerUserRowIdRaw: req.params.follower_user_row_id as string })
  res.json(result)
}))

companySettingsRouter.get('/company_followers/:company_row_id', asyncRoute('Company followers.', async (req, res) => {
  const result = await getCompanyFollowersList({ companyRowIdRaw: req.params.company_row_id as string })
  res.json(result)
}))

companySettingsRouter.get('/company_wallet_address_list', asyncRoute('Company wallet address list.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const checkUserToken = checkUserLoginToken(req.headers)
  const result = await getCompanyWalletAddressList({ checkUserToken })
  res.json(result)
}))

companySettingsRouter.post('/add_company_wallet_address', writeEndpointRateLimiter, addCompanyWalletAddressValidation, asyncRoute('Add company wallet address list.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const errObj = arrangeValidation(validationResult(req))
  const checkUserToken = checkUserLoginToken(req.headers)
  const result = await addCompanyWalletAddress({ checkUserToken, body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

companySettingsRouter.post('/verify_company_email_otp', writeEndpointRateLimiter, verifyCompanyEmailOtpValidation, asyncRoute('Verify company email otp.', async (req, res) => {
  const errObj = arrangeValidation(validationResult(req))
  const checkUserToken = verifyEmailTempToken(req.headers)
  const result = await verifyCompanyEmailOtp({ checkUserToken, body: req.body, preValidationErrors: errObj })
  res.json(result)
}))

// email_verify_otp
companySettingsRouter.get('/send_email_otp', asyncRoute('Send email otp.', async (req, res) => {
  const guard = requireUserLogin(req)
  if (guard) return res.json(guard)
  const checkUserToken = checkUserLoginToken(req.headers)
  const result = await sendEmailOtp({ checkUserToken })
  res.json(result)
}))

// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #10.
companySettingsRouter.post('/update_company_seo', writeEndpointRateLimiter, updateCompanySeoValidation, async (req: Request, res: Response) => {
  try {
    const guard = await requireAllLogin7(req)
    if (guard) return res.json(guard)
    const errObj = arrangeValidation(validationResult(req))
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await updateCompanySeo({ actor, body: req.body, preValidationErrors: errObj })
    res.json(result)
  } catch (err: unknown) {
    logger.error(`Update company SEO error: ${err instanceof Error ? err.message : String(err)}`)
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #11.
companySettingsRouter.get('/get_company_seo/:company_id', async (req: Request, res: Response) => {
  try {
    const guard = await requireAllLogin7(req)
    if (guard) return res.json(guard)
    const actor = await checkAllLoginToken(req.headers, [7])
    const result = await getCompanySeo({ actor, companyId: req.params.company_id as string })
    res.json(result)
  } catch (err: unknown) {
    logger.error(`Get company SEO error: ${err instanceof Error ? err.message : String(err)}`)
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})
