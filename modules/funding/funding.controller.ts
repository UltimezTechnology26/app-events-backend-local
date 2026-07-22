import express, { Router, Request, Response } from 'express'
const { check, validationResult } = require('express-validator')
const sanitize = require('mongo-sanitize')
const { checkAllLoginToken } = require('../../middleware/authorization')
const { arrangeValidation } = require('../../utils/helpers/helper')
import * as service from './funding.service'
import { getFundsRaisedOverview } from './funding.queries'
import { getCache, setCache, buildFundingGraphKey, buildInvestmentGraphKey, buildInvestorListKey, buildInvestorOverviewKey, buildFundsRaisedOverviewKey, buildIndividualDetailsKey, buildCompanyFundingDetailsKey, buildFundsRaisedListSelfKey } from './funding.cache'

export const fundingRouter: Router = express.Router()

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
fundingRouter.get('/investor_list/:investor_type/:skip/:limit', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    const investor_type = Number.parseInt(req.params.investor_type) || 1
    const self = await resolveSelfInvestorId(auth.message.user_row_id, investor_type)
    if (!self.status) return res.json(self)
    const investor_row_id = self.message as number
    const skip = Number.parseInt(req.params.skip)
    const limit = Number.parseInt(req.params.limit)
    const key = buildInvestorListKey(investor_type, investor_row_id, skip, limit, req.query as Record<string, unknown>)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })
    const result = await service.getInvestorList({ investor_type, investor_row_id, skip, limit, query: req.query as Record<string, any> })
    await setCache({ key, value: result, ttl: 1800 })
    return res.json({ status: true, message: result, cache_response_status: false })
  } catch (err: any) {
    console.log('Investor list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: investor_list (3 params; explicit target, admin's original URL shape) ---
fundingRouter.get('/investor_list/:investor_type/:investor_row_id/:skip/:limit', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
    const investor_type = Number.parseInt(req.params.investor_type) || 1
    const investor_row_id = Number.parseInt(req.params.investor_row_id)
    const skip = Number.parseInt(req.params.skip)
    const limit = Number.parseInt(req.params.limit)
    const result = await service.getInvestorList({ investor_type, investor_row_id, skip, limit, query: req.query as Record<string, any> })
    return res.json({ status: true, message: result })
  } catch (err: any) {
    console.log('Investor list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: manual_investor_list ---
fundingRouter.get('/manual_investor_list/:investor_type/:investor_row_id/:skip/:limit', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
    const result = await service.getManualInvestorList({
      investor_type: Number.parseInt(req.params.investor_type) || 1,
      investor_row_id: Number.parseInt(req.params.investor_row_id),
      skip: Number.parseInt(req.params.skip),
      limit: Number.parseInt(req.params.limit),
      query: req.query as Record<string, any>
    })
    return res.json({ status: true, message: result })
  } catch (err: any) {
    console.log('Manual investor list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Shared, but originally public in both files: funding_graph ---
fundingRouter.get('/funding_graph/:company_row_id', async (req, res) => {
  try {
    const company_row_id = Number.parseInt(sanitize(req.params.company_row_id))
    if (Number.isNaN(company_row_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id' } })
    const filterYears = req.query.year_filter && !Number.isNaN(Number.parseInt(req.query.year_filter as string)) ? Number.parseInt(req.query.year_filter as string) : 0
    const key = buildFundingGraphKey(company_row_id, filterYears)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message.list, cache_response_status: true })
    const result = await service.getFundingGraph(company_row_id, filterYears)
    await setCache({ key, value: { list: result }, ttl: 1800 })
    return res.json({ status: true, message: result, cache_response_status: false })
  } catch (err: any) {
    console.log('Funding graph.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- App-side, public by design (viewing a public investor graph) ---
fundingRouter.get('/investment_graph/:investor_type/:investor_row_id', async (req, res) => {
  try {
    const investor_type = Number.parseInt(req.params.investor_type)
    const investor_row_id = Number.parseInt(req.params.investor_row_id)
    if (Number.isNaN(investor_type) || Number.isNaN(investor_row_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id' } })
    const filterYears = req.query.year_filter && !Number.isNaN(Number.parseInt(req.query.year_filter as string)) ? Number.parseInt(req.query.year_filter as string) : 0
    const key = buildInvestmentGraphKey(investor_row_id, filterYears, investor_type)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message.list, cache_response_status: true })
    const result = await service.getInvestmentGraph(investor_type, investor_row_id, filterYears)
    await setCache({ key, value: { list: result }, ttl: 1800 })
    return res.json({ status: true, message: result, cache_response_status: false })
  } catch (err: any) {
    console.log('Investment graph.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Shared: delete_funding_details (app ownership-checked, admin subadmin-checked) ---
fundingRouter.get('/delete_funding_details/:funding_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    const round_id = Number.parseInt(sanitize(req.params.funding_row_id))
    if (Number.isNaN(round_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id' } })
    const scopeType = req.query.type ? Number.parseInt(req.query.type as string) : undefined
    const result = await service.deleteRound({ actor: { ...auth.message, token_message: auth.token_message }, round_id, scopeType })
    return res.json(result)
  } catch (err: any) {
    console.log('Delete funding details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- App-style: investor_user_update_details (always self-scoped, never a client-supplied target) ---
fundingRouter.post('/investor_user_update_details', [
  check('category_row_id').trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
  check('announcement_date').trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
  check('funds_raised_registered_type').trim().not().isEmpty().withMessage('The Investor row id field is required.').isInt({ min: 1, max: 2 }).withMessage('The Investor Registered Type field must be contains only integers.'),
  check('funds_raised_company_row_id').trim().not().isEmpty().withMessage('The Investor Registered Type field is required.')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length) return res.json({ status: false, message: errObj })

    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)

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
  } catch (err: any) {
    console.log('Investor user update details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- App-style: investor_individual_details (always self-scoped) ---
fundingRouter.get('/investor_individual_details/:investor_type/:funding_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    const investor_type = Number.parseInt(req.params.investor_type) || 1
    const funding_row_id = Number.parseInt(req.params.funding_row_id)
    const self = await resolveSelfInvestorId(auth.message.user_row_id, investor_type)
    if (!self.status) return res.json(self)
    const result = await service.getInvestorIndividualDetails(investor_type, self.message as number, funding_row_id)
    if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id.' } })
    return res.json({ status: true, message: result })
  } catch (err: any) {
    console.log('Investor individual details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: single investment record lookup by its own _id, for the "Edit Investment" form ---
fundingRouter.get('/investor_individual_details_admin/:funding_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
    const funding_row_id = Number.parseInt(sanitize(req.params.funding_row_id))
    if (Number.isNaN(funding_row_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id.' } })
    const result = await service.getInvestorIndividualDetailsAdmin(funding_row_id)
    if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id.' } })
    return res.json({ status: true, message: result })
  } catch (err: any) {
    console.log('Investor individual details admin.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Shared: investor_overview — two URL shapes preserved (app infers self, admin takes an explicit param) ---
fundingRouter.get('/investor_overview/:investor_type', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    const investor_type = Number.parseInt(req.params.investor_type) || 1
    const self = await resolveSelfInvestorId(auth.message.user_row_id, investor_type)
    if (!self.status) return res.json(self)
    const investor_row_id = self.message as number
    const key = buildInvestorOverviewKey(investor_type, investor_row_id)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })
    const result = await service.getInvestorOverview(investor_type, investor_row_id)
    await setCache({ key, value: result, ttl: 1800 })
    return res.json({ status: true, message: result, cache_response_status: false })
  } catch (err: any) {
    console.log('Individual overview.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// App-side "Total Investment" overview card (Investments tab) — the original
// route had no auth check at all (fully public given explicit ids), and is a
// distinct, richer computation from the 1-param self overview above. Was
// incorrectly gated admin-only and wired to the wrong (simple) function before
// this fix.
fundingRouter.get('/investor_overview/:investor_type/:investor_row_id', async (req, res) => {
  try {
    const investor_type = Number.parseInt(req.params.investor_type) || 1
    const investor_row_id = Number.parseInt(req.params.investor_row_id)
    const result = await service.getInvestorOverviewDetailed(investor_type, investor_row_id)
    return res.json({ status: true, message: result })
  } catch (err: any) {
    console.log('Investor overview.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Shared: funds_raised_update_details (createOrUpdateRound) ---
fundingRouter.post('/funds_raised_update_details', [
  check('category_row_id').trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
  check('announcement_date').trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
  check('investors').isArray({ min: 1 }).withMessage('The Investors field must contain at least one investor.')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length) return res.json({ status: false, message: errObj })

    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)

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
  } catch (err: any) {
    console.log('Update funds raised details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Shared: funds_raised_individual_details ---
fundingRouter.get('/funds_raised_individual_details/:funding_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    const round_id = Number.parseInt(req.params.funding_row_id)
    let companyScopeId: number | undefined
    if (auth.message.user_type === 1) {
      const ownCompany = await service.resolveOwnCompanyId(auth.message.user_row_id)
      if (!ownCompany.status) return res.json(ownCompany)
      companyScopeId = ownCompany.message as number
    }
    const key = buildIndividualDetailsKey(round_id)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message.list, cache_response_status: true })
    const result = await service.getIndividualDetails(round_id, companyScopeId)
    if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id.' } })
    // BUG FIX: the frontend's edit flow does `data.message[0]`, matching the
    // original backend's contract of returning the raw aggregate array — wrap
    // the single result back into an array here at the response boundary.
    await setCache({ key, value: { list: [result] }, ttl: 1800 })
    return res.json({ status: true, message: [result], cache_response_status: false })
  } catch (err: any) {
    console.log('Funds raised individual details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Shared, public in both original files: funds_raised_overview ---
fundingRouter.get('/funds_raised_overview/:company_row_id', async (req, res) => {
  try {
    const company_row_id = Number.parseInt(req.params.company_row_id as string)
    if (Number.isNaN(company_row_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id.' } })
    const key = buildFundsRaisedOverviewKey(company_row_id)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message.list, cache_response_status: true })
    const result = await getFundsRaisedOverview(company_row_id)
    await setCache({ key, value: { list: result }, ttl: 1800 })
    return res.json({ status: true, message: result, cache_response_status: false })
  } catch (err: any) {
    console.log('Funds raised overview.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Shared: verify_funds_raised_details ---
fundingRouter.get('/verify_funds_raised_details/:funding_row_id', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    const round_id = Number.parseInt(sanitize(req.params.funding_row_id))
    if (Number.isNaN(round_id)) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid funding row id' } })
    let companyScopeId: number | undefined
    if (auth.message.user_type === 1) {
      const ownCompany = await service.resolveOwnCompanyId(auth.message.user_row_id)
      if (!ownCompany.status) return res.json(ownCompany)
      companyScopeId = ownCompany.message as number
    }
    const result = await service.verifyRound({ actor: { ...auth.message, token_message: auth.token_message }, round_id, companyScopeId })
    return res.json(result)
  } catch (err: any) {
    console.log('Verify funds raised details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Shared: reject_funds_raised_details ---
fundingRouter.post('/reject_funds_raised_details', [
  check('funding_row_id').trim().not().isEmpty().withMessage('The Funding row id field required.'),
  check('reject_type').trim().not().isEmpty().withMessage('The Reject type field required.').isInt({ min: 1, max: 10 }).withMessage('The Reject type field must be contains only integers.')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req)
    const errObj = arrangeValidation(errors)
    if (Object.keys(errObj).length) return res.json({ status: false, message: errObj })

    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)

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
  } catch (err: any) {
    console.log('Reject funds raised details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- App-only, self-scoped: funds_raised_list (2 params, distinct from admin's 3-param route below) ---
fundingRouter.get('/funds_raised_list/:skip/:limit', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    const ownCompany = await service.resolveOwnCompanyId(auth.message.user_row_id)
    if (!ownCompany.status) return res.json(ownCompany)
    const companyRowId = ownCompany.message as number
    const skip = Number.parseInt(req.params.skip)
    const limit = Number.parseInt(req.params.limit)
    const key = buildFundsRaisedListSelfKey(companyRowId, skip, limit, req.query as Record<string, unknown>)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })
    const result = await service.getFundsRaisedListSelf(companyRowId, skip, limit, req.query as Record<string, any>)
    await setCache({ key, value: result, ttl: 1800 })
    return res.json({ status: true, message: result, cache_response_status: false })
  } catch (err: any) {
    console.log('Funds raised list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: funds_raised_list ---
fundingRouter.get('/funds_raised_list/:funds_raised_company_row_id/:skip/:limit', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
    const result = await service.getFundsRaisedListAdmin({
      funds_raised_company_row_id: Number.parseInt(req.params.funds_raised_company_row_id),
      skip: Number.parseInt(req.params.skip),
      limit: Number.parseInt(req.params.limit),
      query: req.query as Record<string, any>
    })
    if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id.' } })
    return res.json({ status: true, message: result })
  } catch (err: any) {
    console.log('Funds raised list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: all_funds_raised_list ---
fundingRouter.get('/all_funds_raised_list/:skip/:limit', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
    const result = await service.getAllFundsRaisedList({
      skip: Number.parseInt(req.params.skip),
      limit: Number.parseInt(req.params.limit),
      query: req.query as Record<string, any>
    })
    return res.json({ status: true, message: result })
  } catch (err: any) {
    console.log('All funds raised list.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: dashboard funding stats (no param funds_raised_overview) ---
fundingRouter.get('/dashboard_funds_raised_overview', async (req, res) => {
  try {
    const auth = await checkAllLoginToken(req.headers, [1, 7])
    if (!auth.status) return res.json(auth)
    if (auth.message.user_type !== 2) return res.json(unauthorizedAdminOnly())
    const result = await service.getDashboardFundingStats()
    return res.json({ status: true, message: result })
  } catch (err: any) {
    console.log('Funds raised dashboard stats.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

// --- Admin-only: investor_update_details ---
fundingRouter.post('/investor_update_details', [
  check('investor_row_id').trim().not().isEmpty().withMessage('The User Row ID field is required.'),
  check('category_row_id').trim().not().isEmpty().withMessage('The Category Row ID field is required.'),
  check('announcement_date').trim().not().isEmpty().withMessage('The Announcement Date field is required.'),
  check('funds_raised_registered_type').trim().not().isEmpty().withMessage('The Investor row id field is required.').isInt({ min: 1, max: 2 }).withMessage('The Investor Registered Type field must be contains only integers.'),
  check('funds_raised_company_row_id').trim().not().isEmpty().withMessage('The Investor Registered Type field is required.')
], async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    console.log('Investor update details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
})

/**
 * Public in the original file, moved from controllers/app/company/front_page.js.
 * Exported standalone (not only wired into fundingRouter) so routes/app.js can
 * mount it directly at its original URL (/company/front_page/company_funding_details/:company_row_id),
 * per the confirmed option (a): same URL, relocated handler.
 */
export async function companyFundingDetailsHandler(req: Request, res: Response) {
  try {
    const company_row_id = Number.parseInt(req.params.company_row_id as string)
    const key = buildCompanyFundingDetailsKey(company_row_id, req.query as Record<string, unknown>)
    const cached = await getCache({ key })
    if (cached.status) return res.json({ status: true, message: cached.message, cache_response_status: true })
    const result = await service.getCompanyFundingDetails(company_row_id, req.query as Record<string, any>)
    if (!result) return res.json({ status: false, message: { alert_message: 'Sorry, Invalid company row id' } })
    await setCache({ key, value: result, ttl: 1800 })
    return res.json({ status: true, message: result, cache_response_status: false })
  } catch (err: any) {
    console.log('Company funding details.', err.message)
    res.json({ status: false, message: 'An unexpected error occurred. Please try again later.' })
  }
}

fundingRouter.get('/company_funding_details/:company_row_id', companyFundingDetailsHandler)
