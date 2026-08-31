// modules/company/company.controller.ts
import express, { Router, Request, Response } from 'express'
import logger from '../../../config/logger'
const { checkUserLoginToken } = require('../../../middleware/authorization')
import { getCompanyOtherDetails } from './company.service'
import { getCompanyListDetails } from './company.list'
import { getCompanyIndividualDetails } from './company.individual'
import { getPopularCompanies, getTrendingCompanies, searchCompanies, twitterList, uniqueBusinessModels } from './company.discovery'
import { getRegulatoriesList, getExchangesCountries, getRegulatoriesTypesList, getRegulatoriesBodyList, getIds, getBodyType } from './company.reference'
import { compareCompaniesByIds } from './company.compare'
import { followerIds } from './settings/company.settings.service'
import { overview } from '../company_overview/company_overview.service'
import { submitRequestAsWorking, getTeamMembersForRequest } from '../team-members/team-members.service'
import { watchlistIds } from '../company_watchlist/company_watchlist.service'
import { asyncRoute } from '../../../middleware/asyncRoute'

/**
 * App-only router — matches the Nav table in requirements.md Part 3 §2: profile,
 * list, and partners_list are all under `app/company/front_page/*`, with no admin-side
 * equivalent (admin-coinpedia proxies through the same app endpoints). Mounted into
 * routes/app.js once the first real route lands (Phase B step 2).
 */
export const companyRouter: Router = express.Router()

// Auth audit note (safety-net pass over the 9 mixed-auth routers): every route in this file is
// either fully public (twitter_list, overview, get_ids, get_regulatories_list,
// get_exchanges_countries, get_regulatories_types_list, get_body_type, get_regulatories_body_list,
// search_companies, popular_companies, team_members, submit_request_as_working, follower_ids,
// watchlist_ids, unique_business_models) or soft-gated via checkUserLoginToken — login only
// personalizes the response (user_row_id stays 0 for an anonymous caller) and is never a hard
// reject (individual_other_details, company_list, individual_details, trending_companies). No
// route-level auth middleware is added here: there is no hard-gated route in this file to mirror.
// compareCompaniesByIds (mounted below at /compare_companies_by_ids, defined in
// company.compare.ts) follows the same soft-gated pattern.

/**
 * Ports controllers/app/company/front_page.js's GET
 * /individual_other_details/:company_row_id (lines 9513-9535) verbatim in
 * behavior: checkUserLoginToken is NOT a hard gate here — user_row_id stays 0
 * for an anonymous caller rather than rejecting the request, since the
 * profile page is publicly viewable and only personalizes a few fields
 * (login_user_company_created_status, emp_approval_req_status, follow/
 * watchlist status) when a real user is logged in. The catch block originally
 * leaked the raw error text to the client (matching the live source at the time
 * this was ported) — fixed during the pre-commit code-review pass, along with the
 * same issue found across the rest of modules/ — see noErrMessageLeaks.test.ts.
 *
 * NOT yet mounted into routes/app.js — the legacy route stays live and
 * unchanged until this one is verified over real HTTP traffic and the cutover
 * is explicitly confirmed, per Part 3 §6's "kept until verified, never on a
 * schedule" rule.
 */
companyRouter.get('/individual_other_details/:company_row_id', asyncRoute('Individual company details.', async (req, res) => {
  let user_row_id = 0
  const checkUserToken = checkUserLoginToken(req.headers)
  if (checkUserToken.status) {
    user_row_id = checkUserToken.message
  }

  const company_row_id = Number.parseInt(req.params.company_row_id as string)

  if (!company_row_id || Number.isNaN(company_row_id) || company_row_id <= 0) {
    return res.json({ status: false, message: { alert_message: 'Invalid company row id', company_row_id } })
  }

  const result = await getCompanyOtherDetails({ user_row_id, company_row_id, req })
  return res.json(result)
}))

/**
 * Migrated from controllers/app/company/front_page.js (completeness follow-up — that file's
 * remaining ~19 routes were still physically defined there as thin wrappers instead of being
 * moved into this router, unlike every other fully-migrated module in this codebase). All
 * logic already lived in modules/ — this is a pure route-registration move, no behavior change.
 * front_page.js is deleted; its old mount in routes/app.js is replaced by this router (already
 * mounted at the same '/company/front_page' prefix for individual_other_details above).
 */

// FINAL PHASE: kept live (not retired) — no confirmed caller in either audited frontend repo,
// but per the user's direction this and the other routes below may still be depended on by a
// consumer outside those two repos, so the route stays registered rather than removed.
// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #1.
companyRouter.get('/twitter_list/:skip/:limit', async (req: Request, res: Response) => {
  try {
    const result = await twitterList(req.params.skip, req.params.limit)
    res.json(result)
  }
  catch (err: unknown) {
    logger.error(`twitter list. ${err instanceof Error ? err.message : String(err)}`)
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

// integrated, difference between below api and this api is pagination and search,this can be used for large data
// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #2.
companyRouter.get('/overview', async (req: Request, res: Response) => {
  try {
    const result = await overview(req)
    res.json(result)
  }
  catch (err: unknown) {
    res.json({ status: false, message: { alert_message: 'An unexpected error occurred. Please try again later.' } })
  }
})

// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #3.
companyRouter.get('/company_list/:skip/:limit', async (req: Request, res: Response) => {
  try {
    const skip = !Number.isNaN(Number.parseInt(req.params.skip as string)) ? Number.parseInt(req.params.skip as string) : 0
    const limit = !Number.isNaN(Number.parseInt(req.params.limit as string)) ? Number.parseInt(req.params.limit as string) : 100

    let user_row_id = 0
    const checkUserToken = checkUserLoginToken(req.headers)
    if (checkUserToken.status) {
      user_row_id = checkUserToken.message
    }

    const result = await getCompanyListDetails(req.query, skip, limit, user_row_id)
    return res.json(result)
  } catch (err: unknown) {
    logger.error(`Companies list error: ${err instanceof Error ? err.message : String(err)}`)
    return res.json({
      status: false,
      message: { alert_message: 'An unexpected error occurred. Please try again later.' }
    })
  }
})

companyRouter.get('/individual_details/:company_id', asyncRoute('Individual details.', async (req, res) => {
  let user_row_id = 0
  const checkUserToken = checkUserLoginToken(req.headers)
  if (checkUserToken.status) {
    user_row_id = checkUserToken.message
  }

  const company_id = req.params.company_id as string

  const result = await getCompanyIndividualDetails({ user_row_id, company_id })

  res.json({
    status: result.status,
    message: result.message,
    cache_reponse_status: result.cache_reponse_status
  })
}))

// FINAL PHASE: kept live (not retired) — same rationale as twitter_list above.
companyRouter.get('/get_ids', asyncRoute('Get ids.', async (req, res) => {
  const result = await getIds()
  res.json(result)
}))

// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #4.
companyRouter.get('/get_regulatories_list/:company_row_id', async (req: Request, res: Response) => {
  try {
    const get_query = await getRegulatoriesList(req.params.company_row_id as string)
    return res.json({ status: true, message: get_query })
  } catch (error: unknown) {
    logger.error(`Get regulatories list. ${error instanceof Error ? error.message : String(error)}`)
    return res.json({ status: false, message: 'Something went wrong' })
  }
})

// CONFIRMED BUG FIX (Part 3 §7 Phase H step 14) carried over verbatim: the only live caller
// (admin-coinpedia's token-detail page, via team_members_list.js) passes company_row_id as a
// URL PATH segment (/team_members/4763), not the JSON-array query string this route originally
// expected — meaning it 404'd before ever reaching real logic. getTeamMembersForRequest accepts
// both: an optional path param (the actually-used form) or the original query-string array form.
companyRouter.get('/team_members/:company_row_id?', asyncRoute('Team members.', async (req, res) => {
  const result = await getTeamMembersForRequest(req.headers, req.params.company_row_id, req.query.company_row_id)
  res.json(result)
}))

// FINAL PHASE: kept live (not retired) — same rationale as twitter_list above.
companyRouter.get('/submit_request_as_working/:company_id', asyncRoute('Submit request as working.', async (req, res) => {
  const result = await submitRequestAsWorking(req.headers, req.params.company_id)
  res.json(result)
}))

// FINAL PHASE: kept live (not retired) — same rationale as twitter_list above.
companyRouter.get('/follower_ids', asyncRoute('Follower ids.', async (req, res) => {
  const result = await followerIds(req.headers)
  res.json(result)
}))

// FINAL PHASE: kept live (not retired) — same rationale as twitter_list above.
companyRouter.get('/watchlist_ids', asyncRoute('Watchlist ids.', async (req, res) => {
  const result = await watchlistIds(req.headers)
  res.json(result)
}))

// FINAL PHASE: kept live (not retired) — same rationale as twitter_list above.
companyRouter.get('/unique_business_models', asyncRoute('Unique business models.', async (req, res) => {
  const result = await uniqueBusinessModels()
  res.json(result)
}))

companyRouter.get('/get_exchanges_countries', asyncRoute('Error fetching exchange countries:', async (req, res) => {
  const get_query = await getExchangesCountries()
  res.json({ status: true, message: get_query })
}))

companyRouter.get('/get_regulatories_types_list', asyncRoute('regulatories types error:', async (req, res) => {
  const result = await getRegulatoriesTypesList(req.query.search as string | undefined)
  res.json({ status: true, message: result })
}))

// FINAL PHASE: kept live (not retired) — same rationale as twitter_list above.
// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #5.
companyRouter.get('/get_body_type/:body_id', async (req: Request, res: Response) => {
  try {
    const result = await getBodyType(req.params.body_id as string)
    res.json(result)
  }
  catch (err: unknown) {
    logger.error(`Error fetching body type: ${err instanceof Error ? err.message : String(err)}`)
    res.json({ status: false, message: 'Internal server error' })
  }
})

companyRouter.get('/get_regulatories_body_list', asyncRoute('exchanges countries error:', async (req, res) => {
  const result = await getRegulatoriesBodyList(req.query.search as string | undefined)
  res.json({ status: true, message: result })
}))

companyRouter.get('/trending_companies', asyncRoute('Error in /trending_companies:', async (req, res) => {
  let user_row_id = 0
  const checkUserToken = checkUserLoginToken(req.headers)
  if (checkUserToken.status) {
    user_row_id = checkUserToken.message
  }
  let { skip, limit }: any = req.query
  skip = !Number.isNaN(Number.parseInt(skip)) ? Number.parseInt(skip) : 0
  limit = !Number.isNaN(Number.parseInt(limit)) ? Number.parseInt(limit) : 10

  const result: any = await getTrendingCompanies(user_row_id, skip, limit)

  if (result.status) {
    res.json({
      status: true,
      message: result.message,
      cache_response_status: result.cache_response_status || false
    })
  } else {
    res.json({
      status: false,
      message: result.message,
      error: result.error
    })
  }
}))

// NOT migrated to asyncRoute — see docs/error-handling-exceptions.md #6.
companyRouter.get('/search_companies', async (req: Request, res: Response) => {
  try {
    let limit = 10
    if (req.query.limit && !Number.isNaN(Number.parseInt(req.query.limit as string))) {
      limit = Number.parseInt(req.query.limit as string)
    }

    let search = (req.query.search as string) || ''

    const result: any = await searchCompanies(search, limit)

    if (result.status) {
      res.json({
        status: true,
        message: result.message,
        cache_response_status: result.cache_response_status || false
      })
    } else {
      res.json({
        status: false,
        message: result.message,
        error: result.error
      })
    }
  } catch (err: unknown) {
    logger.error(`Error in /search_companies: ${err instanceof Error ? err.message : String(err)}`)
    res.json({
      status: false,
      message: [],
      error: 'An unexpected error occurred. Please try again later.'
    })
  }
})

companyRouter.get('/compare_companies_by_ids', compareCompaniesByIds)

companyRouter.get('/popular_companies', asyncRoute('Error fetching popular companies:', async (req, res) => {
  const result = await getPopularCompanies()
  return res.json(result)
}))
