import express, { Router, Request } from 'express'
const { check, validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const { checkAllLoginToken } = require('../../../middleware/authorization')
import { arrangeValidation } from '@ultimez-interview/coinpedia-backend-library/validation'
import { writeEndpointRateLimiter } from '../../../middleware/rateLimiter'
import { asyncRoute } from '../../../middleware/asyncRoute'
import * as service from './funding.service'
import { getFundsRaisedOverview } from './funding.queries'
import { getCache, setCache, buildFundingGraphKey, buildInvestmentGraphKey, buildInvestorListKey, buildInvestorOverviewKey, buildFundsRaisedOverviewKey, buildIndividualDetailsKey, buildCompanyFundingDetailsKey, buildFundsRaisedListSelfKey } from './funding.cache'

export const fundingRouter: Router = express.Router()

// Additive safety net: route-level auth middleware mirroring the `const auth = await
// checkAllLoginToken(req.headers, [1, 7]); if (!auth.status) return res.json(auth)` pattern
// that already opens nearly every handler in this file. This file mixes fully-public routes
// (funding_graph, investment_graph, the 2-param investor_overview/funds_raised_overview) with
// [1,7]-gated ones, so a blanket router.use() would incorrectly gate the public routes — hence
// per-route application instead. NOT applied to /investor_update_details, which deliberately
// checks body validation before checking auth (opposite order from every sibling route) — adding
// this middleware ahead of that handler would flip which error surfaces first when both are
// invalid, a real behavior change, not a pure safety net.
async function requireAllLogin17(req: Request): Promise<{ status: false; message: any } | null> {
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  return auth.status ? null : auth
}

function unauthorizedAdminOnly() {
  return { status: false, message: { alert_message: 'Sorry, this action requires admin access.' } }
}

/**
 * Resolves "self" as an investor for app-user actors: investor_type 1 (person)
 * is just their own user_row_id; investor_type 2 (company) must resolve to
 * their own company_row_id via resolveOwnCompanyId — never the raw user_row_id,
 * which is a professional id in a completely different id space from company ids.
 */
async function resolveSelfInvestorId(userRowId: number, investorType: number): Promise<{ status: boolean; message: number | { alert_message: string } }> {
  if (investorType === 2) {
    return service.resolveOwnCompanyId(userRowId)
  }
  return { status: true, message: userRowId }
}

// --- App-only, self-scoped: investor_list (2 params; investor_type-aware self resolution) ---
fundingRouter.get('/investor_list/:investor_type/:skip/:limit', asyncRoute('Investor list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const investor_type = Number.parseInt(req.params.investor_type as string) || 1
  const self = await resolveSelfInvestorId(auth.message.user_row_id, investor_type)
  if (!self.status) return res.json(self)
  const investor_row_id = self.message as number
  const skip = Number.parseInt(req.params.skip as string)
  const limit = Number.parseInt(req.params.limit as string)
  const key = buildInvestorListKey(investor_type, investor_row_id, skip, limit, req.query as Record<string, unknown>)
  const cached = await getCache({ key })
  if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })
  const result = await service.getInvestorList({ investor_type, investor_row_id, skip, limit, query: req.query as Record<string, any> })
  await setCache({ key, value: result, ttl: 1800 })
  return res.json({ status: true, message: result, cache_response_status: false })
}))

// --- Admin-only: investor_list (3 params; explicit target, admin's original URL shape) ---
fundingRouter.get('/investor_list/:investor_type/:investor_row_id/:skip/:limit', asyncRoute('Investor list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
  const investor_type = Number.parseInt(req.params.investor_type as string) || 1
  const investor_row_id = Number.parseInt(req.params.investor_row_id as string)
  const skip = Number.parseInt(req.params.skip as string)
  const limit = Number.parseInt(req.params.limit as string)
  const result = await service.getInvestorList({ investor_type, investor_row_id, skip, limit, query: req.query as Record<string, any> })
  return res.json({ status: true, message: result })
}))

// --- Admin-only: manual_investor_list ---
fundingRouter.get('/manual_investor_list/:investor_type/:investor_row_id/:skip/:limit', asyncRoute('Manual investor list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
  const result = await service.getManualInvestorList({
    investor_type: Number.parseInt(req.params.investor_type as string) || 1,
    investor_row_id: Number.parseInt(req.params.investor_row_id as string),
    skip: Number.parseInt(req.params.skip as string),
    limit: Number.parseInt(req.params.limit as string),
    query: req.query as Record<string, any>
  })
  return res.json({ status: true, message: result })
}))

// --- Shared, but originally public in both files: funding_graph ---
fundingRouter.get('/funding_graph/:company_row_id', asyncRoute('Funding graph.', async (req, res) => {
  const company_row_id = Number.parseInt(sanitize(req.params.company_row_id as string))
  if (Number.isNaN(company_row_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id' } })
  const filterYears = req.query.year_filter && !Number.isNaN(Number.parseInt(req.query.year_filter as string)) ? Number.parseInt(req.query.year_filter as string) : 0
  const key = buildFundingGraphKey(company_row_id, filterYears)
  const cached = await getCache<{ list: unknown[] }>({ key })
  if (cached.status) return res.json({ status: true, message: cached.message.list, cache_response_status: true })
  const result = await service.getFundingGraph(company_row_id, filterYears)
  await setCache({ key, value: { list: result }, ttl: 1800 })
  return res.json({ status: true, message: result, cache_response_status: false })
}))

// --- App-side, public by design (viewing a public investor graph) ---
fundingRouter.get('/investment_graph/:investor_type/:investor_row_id', asyncRoute('Investment graph.', async (req, res) => {
  const investor_type = Number.parseInt(req.params.investor_type as string)
  const investor_row_id = Number.parseInt(req.params.investor_row_id as string)
  if (Number.isNaN(investor_type) || Number.isNaN(investor_row_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id' } })
  const filterYears = req.query.year_filter && !Number.isNaN(Number.parseInt(req.query.year_filter as string)) ? Number.parseInt(req.query.year_filter as string) : 0
  const key = buildInvestmentGraphKey(investor_row_id, filterYears, investor_type)
  const cached = await getCache<{ list: unknown[] }>({ key })
  if (cached.status) return res.json({ status: true, message: cached.message.list, cache_response_status: true })
  const result = await service.getInvestmentGraph(investor_type, investor_row_id, filterYears)
  await setCache({ key, value: { list: result }, ttl: 1800 })
  return res.json({ status: true, message: result, cache_response_status: false })
}))

// --- Shared: delete_funding_details (app ownership-checked, admin subadmin-checked) ---
fundingRouter.get('/delete_funding_details/:funding_row_id', asyncRoute('Delete funding details.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const round_id = Number.parseInt(sanitize(req.params.funding_row_id as string))
  if (Number.isNaN(round_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id' } })
  const scopeType = req.query.type ? Number.parseInt(req.query.type as string) : undefined
  const result = await service.deleteRound({ actor: { ...auth.message, token_message: auth.token_message }, round_id, scopeType })
  return res.json(result)
}))

// --- App-style: investor_user_update_details (always self-scoped, never a client-supplied target) ---
fundingRouter.post('/investor_user_update_details', writeEndpointRateLimiter, [
  check('category_row_id').trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
  check('announcement_date').trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
  check('funds_raised_registered_type').trim().not().isEmpty().withMessage('The Investor row id field is required.').isInt({ min: 1, max: 2 }).withMessage('The Investor Registered Type field must be contains only integers.'),
  check('funds_raised_company_row_id').trim().not().isEmpty().withMessage('The Investor Registered Type field is required.')
], asyncRoute('Investor user update details.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  // CONFIRMED BUG FIX: the original gated everything behind login first (body
  // validation only ever ran, and its errors only ever surfaced, inside the
  // authenticated branch) — auth must be checked before validation, not after,
  // so an unauthenticated request with a malformed body sees the auth failure.
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)

  const errors = validationResult(req)
  const errObj = arrangeValidation(errors)
  if (Object.keys(errObj).length) return res.json({ status: false, message: errObj })

  const result = await service.createInvestorUserUpdate({
    actor: { ...auth.message, token_message: auth.token_message },
    investor_type: Number.parseInt(req.body.investor_type) || 1,
    category_row_id: Number.parseInt(sanitize(req.body.category_row_id)),
    investor_category_row_id: req.body.investor_category_row_id ? Number.parseInt(sanitize(req.body.investor_category_row_id)) : 0,
    announcement_date: req.body.announcement_date,
    amount: req.body.amount,
    funds_raised_registered_type: Number.parseInt(sanitize(req.body.funds_raised_registered_type)),
    funds_raised_company_row_id: Number.parseInt(sanitize(req.body.funds_raised_company_row_id)),
    funding_row_id: req.body.funding_row_id ? Number.parseInt(sanitize(req.body.funding_row_id)) : undefined
  })
  return res.json(result)
}))

// --- App-style: investor_individual_details (always self-scoped) ---
fundingRouter.get('/investor_individual_details/:investor_type/:funding_row_id', asyncRoute('Investor individual details.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const investor_type = Number.parseInt(req.params.investor_type as string) || 1
  const funding_row_id = Number.parseInt(req.params.funding_row_id as string)
  const self = await resolveSelfInvestorId(auth.message.user_row_id, investor_type)
  if (!self.status) return res.json(self)
  const result = await service.getInvestorIndividualDetails(investor_type, self.message as number, funding_row_id)
  if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id.' } })
  return res.json({ status: true, message: result })
}))

// --- Admin-only: single investment record lookup by its own _id, for the "Edit Investment" form ---
fundingRouter.get('/investor_individual_details_admin/:funding_row_id', asyncRoute('Investor individual details admin.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
  const funding_row_id = Number.parseInt(sanitize(req.params.funding_row_id as string))
  if (Number.isNaN(funding_row_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id.' } })
  const result = await service.getInvestorIndividualDetailsAdmin(funding_row_id)
  if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id.' } })
  return res.json({ status: true, message: result })
}))

// --- Shared: investor_overview — two URL shapes preserved (app infers self, admin takes an explicit param) ---
fundingRouter.get('/investor_overview/:investor_type', asyncRoute('Individual overview.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const investor_type = Number.parseInt(req.params.investor_type as string) || 1
  const self = await resolveSelfInvestorId(auth.message.user_row_id, investor_type)
  if (!self.status) return res.json(self)
  const investor_row_id = self.message as number
  const key = buildInvestorOverviewKey(investor_type, investor_row_id)
  const cached = await getCache({ key })
  if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })
  const result = await service.getInvestorOverview(investor_type, investor_row_id)
  await setCache({ key, value: result, ttl: 1800 })
  return res.json({ status: true, message: result, cache_response_status: false })
}))

// App-side "Total Investment" overview card (Investments tab) — a distinct,
// richer computation from the 1-param self overview above.
//
// CORRECTED (previous "CONFIRMED BUG FIX" here added a required-login gate,
// which broke real production traffic): this route's data is also rendered by
// InvestmentOverview.tsx on the PUBLIC, anonymous-visitable company and user
// profile pages (companyDetails.tsx, userDetails.tsx) — those callers have no
// login token to send, so gating this route behind checkAllLoginToken made it
// fail with "The Token field is required in headers." for every logged-out
// visitor. Login is not required here; the global checkApiKey middleware
// still applies, and the data is already publicly displayed one
// investor_row_id at a time on the very pages that call this route.
fundingRouter.get('/investor_overview/:investor_type/:investor_row_id', asyncRoute('Investor overview.', async (req, res) => {
  const investor_type = Number.parseInt(req.params.investor_type as string)
  const investor_row_id = Number.parseInt(req.params.investor_row_id as string)
  // CONFIRMED BUG FIX: the original route validated both params before running
  // any query (else branch: 'Invalid company row id'); the module port dropped
  // this check, so a non-numeric investor_row_id silently ran the aggregate with
  // NaN and returned a zeroed "no investments" result instead of an explicit error.
  if (Number.isNaN(investor_type) || Number.isNaN(investor_row_id)) return res.json({ status: false, message: { alert_message: 'Invalid company row id' } })
  const result = await service.getInvestorOverviewDetailed(investor_type, investor_row_id)
  return res.json({ status: true, message: result })
}))

// --- Shared: funds_raised_update_details (createOrUpdateRound) ---
fundingRouter.post('/funds_raised_update_details', writeEndpointRateLimiter, [
  check('category_row_id').trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
  check('announcement_date').trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
  check('investors').isArray({ min: 1 }).withMessage('The Investors field must contain at least one investor.')
], asyncRoute('Update funds raised details.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  // CONFIRMED BUG FIX: same ordering issue as investor_user_update_details above
  // — auth must be checked before validation, matching the original's
  // auth-gates-everything behavior.
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)

  const errors = validationResult(req)
  const errObj = arrangeValidation(errors)
  if (Object.keys(errObj).length) return res.json({ status: false, message: errObj })

  // funds_raised_company_row_id: app derives it from the caller's own company
  // (never a client-supplied target, and never the raw user_row_id — companies
  // and professionals are separate id spaces); admin takes it from the body
  // directly, matching the pre-existing behavior difference documented in the brief.
  let funds_raised_company_row_id: number
  if (auth.message.user_type === 2) {
    funds_raised_company_row_id = Number.parseInt(sanitize(req.body.funds_raised_company_row_id))
  } else {
    const ownCompany = await service.resolveOwnCompanyId(auth.message.user_row_id)
    if (!ownCompany.status) return res.json(ownCompany)
    funds_raised_company_row_id = ownCompany.message as number
  }

  const result = await service.createOrUpdateRound({
    actor: { ...auth.message, token_message: auth.token_message },
    funds_raised_company_row_id,
    category_row_id: Number.parseInt(sanitize(req.body.category_row_id)),
    announcement_date: req.body.announcement_date,
    amount: req.body.amount,
    funding_row_id: req.body.funding_row_id ? Number.parseInt(req.body.funding_row_id) : undefined,
    investors: req.body.investors
  })
  return res.json(result)
}))

// --- Shared: funds_raised_individual_details ---
fundingRouter.get('/funds_raised_individual_details/:funding_row_id', asyncRoute('Funds raised individual details.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const round_id = Number.parseInt(req.params.funding_row_id as string)
  let companyScopeId: number | undefined
  if (auth.message.user_type === 1) {
    const ownCompany = await service.resolveOwnCompanyId(auth.message.user_row_id)
    if (!ownCompany.status) return res.json(ownCompany)
    companyScopeId = ownCompany.message as number
  }
  const key = buildIndividualDetailsKey(round_id, companyScopeId)
  const cached = await getCache<{ list: unknown[] }>({ key })
  if (cached.status) return res.json({ status: true, message: cached.message.list, cache_response_status: true })
  const result = await service.getIndividualDetails(round_id, companyScopeId)
  if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id.' } })
  // BUG FIX: the frontend's edit flow does `data.message[0]`, matching the
  // original backend's contract of returning the raw aggregate array — wrap
  // the single result back into an array here at the response boundary.
  await setCache({ key, value: { list: [result] }, ttl: 1800 })
  return res.json({ status: true, message: [result], cache_response_status: false })
}))

// --- Shared: funds_raised_overview ---
//
// CORRECTED (previous "CONFIRMED BUG FIX" here added a required-login gate,
// which broke real production traffic): same class of issue as
// investor_overview above — InvestmentOverview.tsx renders this route's data
// on the PUBLIC company and user profile pages (companyDetails.tsx,
// userDetails.tsx), which have no login token for a logged-out visitor to
// send. Login is not required here; the global checkApiKey middleware still
// applies, and the data is already publicly displayed one company_row_id at a
// time on the very pages that call this route.
fundingRouter.get('/funds_raised_overview/:company_row_id', asyncRoute('Funds raised overview.', async (req, res) => {
  const company_row_id = Number.parseInt(req.params.company_row_id as string)
  if (Number.isNaN(company_row_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id.' } })
  const key = buildFundsRaisedOverviewKey(company_row_id)
  const cached = await getCache<{ list: unknown[] }>({ key })
  if (cached.status) return res.json({ status: true, message: cached.message.list, cache_response_status: true })
  const result = await getFundsRaisedOverview(company_row_id)
  await setCache({ key, value: { list: result }, ttl: 1800 })
  return res.json({ status: true, message: result, cache_response_status: false })
}))

// --- Shared: verify_funds_raised_details ---
fundingRouter.get('/verify_funds_raised_details/:funding_row_id', asyncRoute('Verify funds raised details.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const round_id = Number.parseInt(sanitize(req.params.funding_row_id as string))
  if (Number.isNaN(round_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id' } })
  let companyScopeId: number | undefined
  if (auth.message.user_type === 1) {
    const ownCompany = await service.resolveOwnCompanyId(auth.message.user_row_id)
    if (!ownCompany.status) return res.json(ownCompany)
    companyScopeId = ownCompany.message as number
  }
  const result = await service.verifyRound({ actor: { ...auth.message, token_message: auth.token_message }, round_id, companyScopeId })
  return res.json(result)
}))

// --- Shared: reject_funds_raised_details ---
fundingRouter.post('/reject_funds_raised_details', writeEndpointRateLimiter, [
  check('funding_row_id').trim().not().isEmpty().withMessage('The Funding row id field required.'),
  check('reject_type').trim().not().isEmpty().withMessage('The Reject type field required.').isInt({ min: 1, max: 10 }).withMessage('The Reject type field must be contains only integers.')
], asyncRoute('Reject funds raised details.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  // CONFIRMED BUG FIX: same ordering issue as investor_user_update_details above
  // — auth must be checked before validation, matching the original's
  // auth-gates-everything behavior.
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)

  const errors = validationResult(req)
  const errObj = arrangeValidation(errors)
  if (Object.keys(errObj).length) return res.json({ status: false, message: errObj })

  const round_id = Number.parseInt(sanitize(req.body.funding_row_id))
  if (Number.isNaN(round_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id' } })
  let companyScopeId: number | undefined
  if (auth.message.user_type === 1) {
    const ownCompany = await service.resolveOwnCompanyId(auth.message.user_row_id)
    if (!ownCompany.status) return res.json(ownCompany)
    companyScopeId = ownCompany.message as number
  }
  const result = await service.rejectRound({ actor: { ...auth.message, token_message: auth.token_message }, round_id, reject_type: Number.parseInt(req.body.reject_type), reject_reason: req.body.reject_reason, companyScopeId })
  return res.json(result)
}))

// --- App-only, self-scoped: funds_raised_list (2 params, distinct from admin's 3-param route below) ---
fundingRouter.get('/funds_raised_list/:skip/:limit', asyncRoute('Funds raised list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  const ownCompany = await service.resolveOwnCompanyId(auth.message.user_row_id)
  if (!ownCompany.status) return res.json(ownCompany)
  const companyRowId = ownCompany.message as number
  const skip = Number.parseInt(req.params.skip as string)
  const limit = Number.parseInt(req.params.limit as string)
  const key = buildFundsRaisedListSelfKey(companyRowId, skip, limit, req.query as Record<string, unknown>)
  const cached = await getCache({ key })
  if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })
  const result = await service.getFundsRaisedListSelf(companyRowId, skip, limit, req.query as Record<string, any>)
  await setCache({ key, value: result, ttl: 1800 })
  return res.json({ status: true, message: result, cache_response_status: false })
}))

// --- Admin-only: funds_raised_list ---
fundingRouter.get('/funds_raised_list/:funds_raised_company_row_id/:skip/:limit', asyncRoute('Funds raised list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
  const result = await service.getFundsRaisedListAdmin({
    funds_raised_company_row_id: Number.parseInt(req.params.funds_raised_company_row_id as string),
    skip: Number.parseInt(req.params.skip as string),
    limit: Number.parseInt(req.params.limit as string),
    query: req.query as Record<string, any>
  })
  if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id.' } })
  return res.json({ status: true, message: result })
}))

// --- Admin-only: manual_funds_raised_list (Part 3 §7 Phase H step 9 — confirmed
// live, ported from controllers/admin_panel/app/funding.js:2185-2906) ---
fundingRouter.get('/manual_funds_raised_list/:funds_raised_company_row_id/:skip/:limit', asyncRoute('Manual funds raised list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
  const funds_raised_company_row_id = Number.parseInt(req.params.funds_raised_company_row_id as string)
  const skip = !Number.isNaN(Number.parseInt(req.params.skip as string)) ? Number.parseInt(req.params.skip as string) : 0
  const limit = !Number.isNaN(Number.parseInt(req.params.limit as string)) ? Number.parseInt(req.params.limit as string) : 100
  const result = await service.getManualFundsRaisedList({ funds_raised_company_row_id, skip, limit })
  if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid investor id.' } })
  return res.json({ status: true, message: result })
}))

// --- Admin-only: all_funds_raised_list ---
fundingRouter.get('/all_funds_raised_list/:skip/:limit', asyncRoute('All funds raised list.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
  const result = await service.getAllFundsRaisedList({
    skip: Number.parseInt(req.params.skip as string),
    limit: Number.parseInt(req.params.limit as string),
    query: req.query as Record<string, any>
  })
  return res.json({ status: true, message: result })
}))

// --- Admin-only: dashboard funding stats (no param funds_raised_overview) ---
fundingRouter.get('/dashboard_funds_raised_overview', asyncRoute('Funds raised dashboard stats.', async (req, res) => {
  const guard = await requireAllLogin17(req)
  if (guard) return res.json(guard)
  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
  const result = await service.getDashboardFundingStats()
  return res.json({ status: true, message: result })
}))

// --- Admin-only: investor_update_details ---
// Not given the requireAllLogin17 route-level gate: uniquely in this file, this handler checks
// body validation BEFORE checkAllLoginToken (every sibling route checks auth first). Adding the
// middleware ahead of the check() array would flip that order and change which error surfaces
// first when both validation and auth are invalid — left untouched to avoid that behavior change.
fundingRouter.post('/investor_update_details', writeEndpointRateLimiter, [
  check('investor_row_id').trim().not().isEmpty().withMessage('The User Row ID field is required.'),
  check('category_row_id').trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
  check('announcement_date').trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
  check('funds_raised_registered_type').trim().not().isEmpty().withMessage('The Investor row id field is required.').isInt({ min: 1, max: 2 }).withMessage('The Investor Registered Type field must be contains only integers.'),
  check('funds_raised_company_row_id').trim().not().isEmpty().withMessage('The Investor Registered Type field is required.')
], asyncRoute('Investor update details.', async (req, res) => {
  const errors = validationResult(req)
  const errObj = arrangeValidation(errors)
  if (Object.keys(errObj).length) return res.json({ status: false, message: errObj })

  const auth = await checkAllLoginToken(req.headers, [1, 7])
  if (!auth.status) return res.json(auth)
  if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())

  const result = await service.createInvestorUpdateAdmin({
    actor: { ...auth.message, token_message: auth.token_message },
    investor_type: Number.parseInt(req.body.investor_type) || 1,
    investor_row_id: Number.parseInt(req.body.investor_row_id),
    category_row_id: Number.parseInt(req.body.category_row_id),
    investor_category_row_id: req.body.investor_category_row_id ? Number.parseInt(sanitize(req.body.investor_category_row_id)) : 0,
    announcement_date: req.body.announcement_date,
    amount: req.body.amount,
    funds_raised_registered_type: Number.parseInt(req.body.funds_raised_registered_type),
    funds_raised_company_row_id: Number.parseInt(req.body.funds_raised_company_row_id),
    funding_row_id: req.body.funding_row_id ? Number.parseInt(req.body.funding_row_id) : undefined
  })
  return res.json(result)
}))

/**
 * Public in the original file, moved from controllers/app/company/front_page.js.
 * Exported standalone (not only wired into fundingRouter) so routes/app.js can
 * mount it directly at its original URL (/company/front_page/company_funding_details/:company_row_id),
 * per the confirmed option (a): same URL, relocated handler.
 */
export const companyFundingDetailsHandler = asyncRoute('Company funding details.', async (req, res) => {
  const company_row_id = Number.parseInt(req.params.company_row_id as string)
  const key = buildCompanyFundingDetailsKey(company_row_id, req.query as Record<string, unknown>)
  const cached = await getCache({ key })
  if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })
  const result = await service.getCompanyFundingDetails(company_row_id, req.query as Record<string, any>)
  if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id' } })
  await setCache({ key, value: result, ttl: 1800 })
  return res.json({ status: true, message: result, cache_response_status: false })
})

fundingRouter.get('/company_funding_details/:company_row_id', companyFundingDetailsHandler)
