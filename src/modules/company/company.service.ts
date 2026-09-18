// modules/company/company.service.ts
//
// Business logic for modules/company/ (profile, list, partners_list).
// Populated incrementally per Phase B — each function lands via TDD (Part 3 §7 Phase B),
// migrating the corresponding logic out of services/company/front_page.ts.

import { Request } from 'express'
import redisCache, { CacheDuration } from '../../../config/redis'
import logger from '../../../config/logger'
import { array_column, company_profile_completed_percentage } from '../../../utils/helpers/helper'
import { getCompanyProducts, getMatchedProducts, getTokenList } from '../../../utils/helpers/app_helper'
import { getEventsData, professionalfilterQuery } from '../../../utils/helpers/events_helper'
import { getCompanyProfileRevenueSummary, companyIndividualRevenue } from '../company_revenue/company_revenue.queries'
import { getPublicTeamMembersList } from '../team-members/team-members.queries'
import {
  extractPaginatedResult,
  findCompanyForOtherDetails,
  findCompanyOwnedByUser,
  findEmployeeApprovalRequest,
  findCompanyFaqList,
  findEventSponsorPartnerEventIds,
  getSimilarCompanies,
  getLegacySimilarCompanies,
  getLegacyPeoplesInCompany,
  companyHasProducts,
  companyHasHoldings,
  companyHasInvested,
  companyHasRaised,
  companyHasApplicants,
  runCompanyListType1Aggregate,
  CompanyListType1Params,
  CompanyFaqListItem,
  SimilarCompanyRow,
  LegacyPeoplesInCompanyRow
} from './company.queries'

interface CompanyIndividualEventsResult {
  hosts: unknown[]
  sponsors: unknown[]
  partners: unknown[]
}

/**
 * Relocated verbatim from services/company/front_page.ts (Part 3 §7 Phase H
 * step 13) — this fixes modules/company/company.service.ts's prior backward
 * import of this function FROM the legacy services file; it now lives where
 * it's actually used. No behavior change.
 */
export const companyIndividualEvents = async ({
  company_row_id,
  req
}: {
  company_row_id: number
  req: Request
}): Promise<CompanyIndividualEventsResult> => {
    const result: CompanyIndividualEventsResult = { hosts: [], sponsors: [], partners: [] }
    const filter_array = [{ active_status: 1, approval_status: 1, company_row_id: company_row_id, list_event_type: { $in: [2, 3] } }]
    const search_query = [{}]
    let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query, sort: undefined, event_status: undefined })
    const sort_value = { end_date: -1 }

    const { list } = await getEventsData({
        sort_value: sort_value,
        top_filter_array: { $and: top_filter_array },
        search_query: { $and: search_array },
        req_query: undefined,
        req_params: undefined,
        req_headers: req.headers
    })
    result.hosts = list

    // PERF FIX: these two existence checks are independent of each other (different
    // sponsor_partner_type) but previously ran as two sequential awaits. Batched into one
    // Promise.all — same two results, computed concurrently instead of one after another.
    const [check_sponsors, check_partners] = await Promise.all([
        findEventSponsorPartnerEventIds({ company_row_id, sponsor_partner_type: 1 }),
        findEventSponsorPartnerEventIds({ company_row_id, sponsor_partner_type: 2 })
    ])

    if (check_sponsors) {
        const sponsor_array = await array_column(check_sponsors, 'event_row_id')
        if (sponsor_array.length) {
            const filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: sponsor_array }, list_event_type: { $in: [1, 2, 3] } }]
            let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query, sort: undefined, event_status: undefined })
            const { list } = await getEventsData({
                sort_value: sort_value,
                top_filter_array: { $and: top_filter_array },
                search_query: { $and: search_array },
                req_query: undefined,
                req_params: undefined,
                req_headers: req.headers
            })
            result.sponsors = list
        }
    }

    if (check_partners) {
        const partner_array = await array_column(check_partners, 'event_row_id')
        if (partner_array.length) {
            const filter_array = [{ active_status: 1, approval_status: 1, _id: { $in: partner_array }, list_event_type: { $in: [1, 2, 3] } }]
            let { top_filter_array, search_array } = await professionalfilterQuery({ top_filter_array: filter_array, search_array: search_query, req_query: req.query, sort: undefined, event_status: undefined })
            const { list } = await getEventsData({
                sort_value: sort_value,
                top_filter_array: { $and: top_filter_array },
                search_query: { $and: search_array },
                req_query: undefined,
                req_params: undefined,
                req_headers: req.headers
            })
            result.partners = list
        }
    }

    return result
}

interface CompanyOtherDetailsResult {
  login_user_company_created_status: boolean
  logged_in_user_row_id?: number
  emp_approval_req_status: number
  faq_list?: CompanyFaqListItem[]
  peoples_in_company?: unknown
  profile_completed_percentage?: unknown
  revenue?: unknown
  event?: CompanyIndividualEventsResult
  similar_companies?: SimilarCompanyRow[]
  hasHoldings?: boolean
  has_products?: boolean
  has_invested?: boolean
  has_raised?: boolean
  hasApplicants?: boolean
}

/**
 * Ports companyOtherDetails (services/company/front_page.ts:8673-9240) —
 * the `individual_other_details` handler, measured at a 16.3s baseline
 * (Part 2 §2.1). Cache mechanism preserved exactly (config/redis's redisCache
 * + CacheDuration, NOT modules/common's cache_helper-based company.cache.ts —
 * these are two separate caching systems in this codebase and this endpoint
 * genuinely uses the former; swapping it would be an unplanned, undocumented
 * behavior change, so it stays as-is here).
 *
 * The Team Members section (`peoples_in_company`) now calls
 * modules/team-members/team-members.queries.ts's getPublicTeamMembersList()
 * instead of running its own copy of the pipeline (Part 3 §7 Phase B step 5,
 * confirmed with the user this is a genuinely distinct view from
 * getEmployeeList — verified-only + social links + follow-status — not the
 * same query duplicated, before building it as its own function there). The
 * Similar Companies section now uses buildProfessionalEnrichmentStages() instead of a
 * duplicated inline block (Part 1 §3 finding 2), with no behavior change.
 * The Revenue-tab summary now calls modules/company_revenue's
 * getCompanyProfileRevenueSummary() (Part 3 §7 Phase D step 4) instead of
 * services/company/front_page.ts's companyIndividualRevenue directly — pure
 * move, no behavior change. companyIndividualEvents is still called as before
 * (Events stays out of scope for this build).
 */
export async function getCompanyOtherDetails({
  user_row_id,
  company_row_id,
  req
}: {
  user_row_id: number
  company_row_id: number
  req: Request
}) {
  if (!company_row_id || Number.isNaN(company_row_id) || company_row_id <= 0) {
    return { status: false, message: { alert_message: 'Invalid company row id' } }
  }

  const queryString = JSON.stringify(req.query || {})
  const key = `app_company_individual_other_details_${company_row_id}_${user_row_id}_${queryString}`

  // The live source (services/company/front_page.ts:8684-8691) calls getCache
  // but never uses its result — the read short-circuit is commented out, so
  // every call recomputes the full pipeline even on a cache hit. Confirmed
  // dead code, not assumed. Re-enabled here as a deliberate fix (not an
  // oversight): cache invalidation for this exact key pattern
  // (SHARED_COMPANY_CACHE_PATTERNS.INDIVIDUAL_OTHER_DETAILS) is already wired
  // into ~40 write-path call sites across settings/revenue/products/holdings/
  // employees/faq/jobs/funding/followers/watchlist/events, and both caching
  // systems in this codebase (config/redis.ts, config/cache_helper.js) share
  // the same REDIS_CACHE_URL keyspace, so those existing invalidation calls
  // correctly bust this key regardless of which system wrote it.
  const cachedData = await redisCache.getCache({ key })
  if (cachedData && cachedData.status) {
    return {
      status: true,
      message: cachedData.message,
      cache_response_status: true
    }
  }

  const get_query = await findCompanyForOtherDetails(company_row_id)
  if (!get_query) {
    return { status: false, message: { alert_message: 'Invalid company row id' } }
  }

  const result: CompanyOtherDetailsResult = {
    login_user_company_created_status: false,
    emp_approval_req_status: 0
  }
  if (user_row_id != 0) {
    result.logged_in_user_row_id = user_row_id
    const get_company = await findCompanyOwnedByUser(user_row_id)
    if (get_company) {
      result.login_user_company_created_status = true
    }
  }

  if (user_row_id > 0 && user_row_id != company_row_id) {
    const employees_request_query = await findEmployeeApprovalRequest({ company_row_id, user_row_id })
    if (employees_request_query) {
      result.emp_approval_req_status = employees_request_query.approval_status
    }
  }

  const faq_query = findCompanyFaqList(company_row_id)

  const peoples_in_company_query = getPublicTeamMembersList({ company_row_id, viewer_user_row_id: user_row_id })

  const profile_completed_percentage_data = company_profile_completed_percentage(result)

  const revenue_data = getCompanyProfileRevenueSummary({ company_row_id, req })

  const event_data = companyIndividualEvents({ company_row_id, req })

  const main_business_model_id = get_query.main_business_model_id
  const similar_companies_query = getSimilarCompanies({ company_row_id, user_row_id, main_business_model_id })

  const has_products_query = companyHasProducts(company_row_id)

  const hasHoldings_query = companyHasHoldings(company_row_id)

  const has_invested_query = companyHasInvested(company_row_id)

  const has_raised_query = companyHasRaised(company_row_id)

  const hasApplicants_query = companyHasApplicants(company_row_id)

  const [faq_list, peoples_in_company, profile_completed_percentage, revenue, event, similar_companies, has_products, hasHoldings, has_invested, has_raised, hasApplicants] =
    await Promise.all([
      faq_query,
      peoples_in_company_query,
      profile_completed_percentage_data,
      revenue_data,
      event_data,
      similar_companies_query,
      has_products_query,
      hasHoldings_query,
      has_invested_query,
      has_raised_query,
      hasApplicants_query
    ])

  result.faq_list = faq_list
  result.peoples_in_company = peoples_in_company
  result.profile_completed_percentage = profile_completed_percentage
  result.revenue = revenue
  result.event = event
  result.similar_companies = similar_companies
  result.hasHoldings = !!hasHoldings
  result.has_products = !!has_products
  result.has_invested = !!has_invested
  result.has_raised = !!has_raised
  result.hasApplicants = !!hasApplicants

  redisCache
    .setCache({
      key,
      value: result,
      ttl: CacheDuration.THIRTY_MINUTES
    })
    .catch((err: Error) => logger.error(`Cache set error. ${err.message}`))

  return { status: true, message: result, cache_response_status: false }
}

interface CompanyListRow {
  _id: unknown
  product_ids?: Array<{ register_type: unknown; product_type: unknown; product_row_id: unknown }>
  products?: unknown[]
  token_row_ids?: unknown[]
  tokens_list?: unknown[]
  [key: string]: unknown
}

interface CompanyProductListItem {
  register_type: unknown
  product_type: unknown
  product_row_id: unknown
  [key: string]: unknown
}

interface TokenListItem {
  _id: unknown
  symbol?: string
  token_name?: string
  price?: number
  percent_change_24h?: number
  marketcap?: number
  volume?: number
  token_image?: string
  total_supply?: number
}

/**
 * Ports companyList's report_list_type===1 branch (services/company/front_page.ts:52-1053),
 * called by getCompanyListDetails (still in services/company/front_page.ts — the
 * shared geo/search-filter/cache wrapper isn't part of this step's scope, only
 * this type's own aggregation logic is). Returns the same `{ list, count }`
 * shape as the legacy companyList() so the caller doesn't need to change.
 *
 * Real change from the legacy version: list and count now come from ONE
 * $facet stage (buildCompanyListType1Pipeline) sharing a single $match chain,
 * instead of two separate `.aggregate()` calls — this is also the fix for the
 * confirmed count/list login_status inconsistency (Part 3 §7 Phase B step 3,
 * confirmed with the user before implementing): the legacy count_query never
 * applied the login_status filter the list query does.
 */
export async function getCompanyListType1Result({
  query,
  skip,
  limit,
  user_row_id,
  sort_filter,
  boundingBox
}: CompanyListType1Params) {
  const aggregateOutput = await runCompanyListType1Aggregate({ query, skip, limit, user_row_id, sort_filter, boundingBox })
  const { data, count: final_count } = extractPaginatedResult(aggregateOutput)
  const result1: CompanyListRow[] = data

  const products_list: CompanyProductListItem[] = await getCompanyProducts(result1)

  await Promise.all(
    result1.map(async (item) => {
      if (item.product_ids?.length) {
        item.products = await getMatchedProducts(item.product_ids, products_list)
      }
    })
  )

  const tokenIds: unknown[] = result1.flatMap((r) => (Array.isArray(r.token_row_ids) ? r.token_row_ids : []))
  const token_list: TokenListItem[] = await getTokenList({ token_ids: tokenIds })
  const tokenMap: Record<string, TokenListItem> = Object.fromEntries(token_list.map((t) => [t._id?.toString(), t]))

  result1.forEach((row) => {
    if (!row.token_row_ids) return
    const tokens_list = row.token_row_ids.map((id) => tokenMap[(id as { toString(): string })?.toString()]).filter(Boolean)
    const match = result1.find((r) => r._id == row._id)
    if (match) {
      match.tokens_list = tokens_list
    }
  })

  return {
    list: result1,
    count: final_count
  }
}

/**
 * The original (pre-Phase-B) implementation of the individual_other_details
 * response, superseded by getCompanyOtherDetails above but kept — not deleted
 * or filed in a separate "dead code" holding file — per the FINAL PHASE
 * decision: this route's URL may still be depended on by a consumer outside
 * the two frontend repos this engagement's research covered, so it stays live
 * in its natural home rather than quarantined or dropped.
 */
export const companyOtherDetails = async ({
  user_row_id,
  company_row_id,
  req
}: {
  user_row_id: number
  company_row_id: number
  req: Request
}) => {
  // Early validation
  if (!company_row_id || Number.isNaN(company_row_id) || company_row_id <= 0) {
    return { status: false, message: { alert_message: 'Invalid company row id' } };
  }

  // Generate cache key with stable query string
  const queryString = JSON.stringify(req.query || {});
  const key = `app_company_individual_other_details_${company_row_id}_${user_row_id}_${queryString}`;

  // Check cache first
  const cachedData = await redisCache.getCache({ key });
  // if (cachedData && cachedData.status) {
  //     return {
  //         status: true,
  //         message: cachedData.message,
  //         cache_response_status: true
  //     };
  // }
  const get_query = await findCompanyForOtherDetails(company_row_id)
  if (get_query) {

    const result: CompanyOtherDetailsResult = {
      login_user_company_created_status: false,
      emp_approval_req_status: 0
    }
    if (user_row_id != 0) {
      result.logged_in_user_row_id = user_row_id
      const get_company = await findCompanyOwnedByUser(user_row_id)
      if (get_company) {
        result.login_user_company_created_status = true
      }
    }

    if ((user_row_id > 0) && (user_row_id != company_row_id)) {
      const employees_request_query = await findEmployeeApprovalRequest({ company_row_id, user_row_id })
      if (employees_request_query) {
        result.emp_approval_req_status = employees_request_query.approval_status
      }
    }

    const faq_query = findCompanyFaqList(company_row_id)

    const peoples_in_company_query: Promise<LegacyPeoplesInCompanyRow[]> = getLegacyPeoplesInCompany({ company_row_id, user_row_id })

    const profile_completed_percentage_data = company_profile_completed_percentage(result)

    const revenue_data = companyIndividualRevenue({ company_row_id, req })

    const event_data = companyIndividualEvents({ company_row_id, req })

    const main_business_model_id = get_query.main_business_model_id
    const similar_companies_query = getLegacySimilarCompanies({ company_row_id, user_row_id, main_business_model_id })

    const has_products_query = companyHasProducts(company_row_id);

    const hasHoldings_query = companyHasHoldings(company_row_id);

    const has_invested_query = companyHasInvested(company_row_id);

    const has_raised_query = companyHasRaised(company_row_id);

    const hasApplicants_query = companyHasApplicants(company_row_id);

    const [faq_list, peoples_in_company, profile_completed_percentage, revenue, event, similar_companies, has_products, hasHoldings, has_invested, has_raised, hasApplicants] = await Promise.all([faq_query, peoples_in_company_query, profile_completed_percentage_data, revenue_data, event_data, similar_companies_query, has_products_query, hasHoldings_query, has_invested_query, has_raised_query, hasApplicants_query])

    result.faq_list = faq_list
    result.peoples_in_company = peoples_in_company
    result.profile_completed_percentage = profile_completed_percentage
    result.revenue = revenue
    result.event = event
    result.similar_companies = similar_companies
    result.hasHoldings = !!hasHoldings;
    result.has_products = !!has_products;
    result.has_invested = !!has_invested;
    result.has_raised = !!has_raised;
    result.hasApplicants = !!hasApplicants;

    // Set cache asynchronously (non-blocking)
    redisCache.setCache({
      key,
      value: result,
      ttl: CacheDuration.THIRTY_MINUTES
    }).catch((err: Error) => logger.error(`Cache set error. ${err.message}`));

    return { status: true, message: result, cache_response_status: false }
  }
  else {
    return { status: false, message: { alert_message: 'Invalid company row id' } }
  }
}
