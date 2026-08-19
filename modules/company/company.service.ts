// modules/company/company.service.ts
//
// Business logic for modules/company/ (profile, list, partners_list).
// Populated incrementally per Phase B — each function lands via TDD (Part 3 §7 Phase B),
// migrating the corresponding logic out of services/company/front_page.ts.

import redisCache, { CacheDuration } from '../../config/redis'
import { array_column, company_profile_completed_percentage } from '../../utils/helpers/helper'
import { getCompanyProducts, getMatchedProducts, getTokenList } from '../../utils/helpers/app_helper'
import { getEventsData, professionalfilterQuery } from '../../utils/helpers/events_helper'
import { getCompanyProfileRevenueSummary, companyIndividualRevenue } from '../company_revenue/company_revenue.queries'
import { getPublicTeamMembersList } from '../team-members/team-members.queries'
import { buildProfessionalEnrichmentStages } from '../common/common.enrichment'
import {
  buildSimilarCompaniesPipeline,
  buildCompanyListType1Pipeline,
  extractPaginatedResult
} from './company.queries'

const companyM = require('../../models/app/company/companyM')
const employees_requestsM = require('../../models/app/company/employees_requestsM')
const company_faqM = require('../../models/app/company/company_faqM')
const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
const company_holdingM = require('../../models/markets/products_n_holding/company_holdingM')
const fundingM = require('../../models/app/funding/fundingInvestmentM')
const jobsM = require('../../models/app/jobs/jobsM')
const event_sponsors_partner_detailsM = require('../../models/app/events/event_sponsors_partner_detailsM')

/**
 * Relocated verbatim from services/company/front_page.ts (Part 3 §7 Phase H
 * step 13) — this fixes modules/company/company.service.ts's prior backward
 * import of this function FROM the legacy services file; it now lives where
 * it's actually used. No behavior change.
 */
export const companyIndividualEvents = async ({ company_row_id, req }: { company_row_id: number, req: any }) => {
    let result: any = {}
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
    result['hosts'] = list

    result['sponsors'] = []
    result['partners'] = []

    // PERF FIX: these two existence checks are independent of each other (different
    // sponsor_partner_type) but previously ran as two sequential awaits. Batched into one
    // Promise.all — same two results, computed concurrently instead of one after another.
    const [check_sponsors, check_partners] = await Promise.all([
        event_sponsors_partner_detailsM.find({ account_type: 2, registered_type: 1, sponsor_partner_type: 1, user_company_row_id: company_row_id }, { event_row_id: 1 }).lean(),
        event_sponsors_partner_detailsM.find({ account_type: 2, registered_type: 1, sponsor_partner_type: 2, user_company_row_id: company_row_id }, { event_row_id: 1 }).lean()
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
            result['sponsors'] = list
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
            result['partners'] = list
        }
    }

    return result
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
  req: any
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

  const get_query = await companyM.findOne({ _id: company_row_id, approval_status: 1, active_status: 1 }, { _id: 1, main_business_model_id: 1 }).lean()
  if (!get_query) {
    return { status: false, message: { alert_message: 'Invalid company row id' } }
  }

  let result: any = {}
  result['login_user_company_created_status'] = false
  if (user_row_id != 0) {
    result['logged_in_user_row_id'] = user_row_id
    const get_company = await companyM.findOne({ user_row_id: user_row_id }, { _id: 1 }).lean()
    if (get_company) {
      result['login_user_company_created_status'] = true
    }
  }

  result['emp_approval_req_status'] = 0
  if (user_row_id > 0 && user_row_id != company_row_id) {
    const employees_request_query = await employees_requestsM.findOne({ company_row_id: company_row_id, user_row_id: user_row_id }, { approval_status: 1 }).lean()
    if (employees_request_query) {
      result['emp_approval_req_status'] = employees_request_query.approval_status
    }
  }

  const faq_query = company_faqM.find({ company_row_id: company_row_id }, { _id: 1, faq_question: 1, faq_answer: 1 }).lean()

  const peoples_in_company_query = getPublicTeamMembersList({ company_row_id, viewer_user_row_id: user_row_id })

  const profile_completed_percentage_data = company_profile_completed_percentage(result)

  const revenue_data = getCompanyProfileRevenueSummary({ company_row_id, req })

  const event_data = companyIndividualEvents({ company_row_id, req })

  const main_business_model_id = get_query.main_business_model_id
  const similar_companies_query = companyM
    .aggregate(buildSimilarCompaniesPipeline({ company_row_id, user_row_id, main_business_model_id }))
    .limit(4)

  const has_products_query = company_productsM.exists({
    company_row_id: company_row_id,
    company_type: 1
  })

  const hasHoldings_query = company_holdingM.exists({
    company_row_id,
    company_type: 1
  })

  const has_invested_query = fundingM.exists({
    investor_row_id: company_row_id,
    investor_type: 2,
    investor_registered_type: 1,
    verified_status: 1
  })

  const has_raised_query = fundingM.exists({
    funds_raised_company_row_id: company_row_id,
    funds_raised_registered_type: 1,
    verified_status: 1
  })

  const hasApplicants_query = jobsM.exists({ company_row_id, is_deleted: false })

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

  result['faq_list'] = faq_list
  result['peoples_in_company'] = peoples_in_company
  result['profile_completed_percentage'] = profile_completed_percentage
  result['revenue'] = revenue
  result['event'] = event
  result['similar_companies'] = similar_companies
  result['hasHoldings'] = !!hasHoldings
  result['has_products'] = !!has_products
  result['has_invested'] = !!has_invested
  result['has_raised'] = !!has_raised
  result['hasApplicants'] = !!hasApplicants

  redisCache
    .setCache({
      key,
      value: result,
      ttl: CacheDuration.THIRTY_MINUTES
    })
    .catch((err: Error) => console.error('Cache set error:', err))

  return { status: true, message: result, cache_response_status: false }
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
}: {
  query: any
  skip: number
  limit: number
  user_row_id: any
  sort_filter: any
  boundingBox?: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null
}) {
  const aggregateOutput = await companyM.aggregate(
    buildCompanyListType1Pipeline({ query, skip, limit, user_row_id, sort_filter, boundingBox })
  )
  const { data: result1, count: final_count } = extractPaginatedResult(aggregateOutput)

  const products_list: any[] = await getCompanyProducts(result1)

  await Promise.all(
    result1.map(async (item: any) => {
      if (item.product_ids?.length) {
        item.products = await getMatchedProducts(item.product_ids, products_list)
      }
    })
  )

  const tokenIds: any[] = result1.flatMap((r: any) => (Array.isArray(r.token_row_ids) ? r.token_row_ids : []))
  const token_list: any[] = await getTokenList({ token_ids: tokenIds })
  const tokenMap: Record<string, any> = Object.fromEntries(token_list.map((t: any) => [t._id?.toString(), t]))

  result1.forEach((row: any) => {
    if (!row.token_row_ids) return
    const tokens_list = row.token_row_ids.map((id: any) => tokenMap[id?.toString()]).filter(Boolean)
    const match = result1.find((r: any) => r._id == row._id)
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
export const companyOtherDetails = async ({ user_row_id, company_row_id, req }: { user_row_id: number, company_row_id: number, req: any }) => {
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
  const get_query = await companyM.findOne({ _id: company_row_id, approval_status: 1, active_status: 1 }, { _id: 1, main_business_model_id: 1 }).lean()
  if (get_query) {

    let result: any = {}
    result['login_user_company_created_status'] = false
    if (user_row_id != 0) {
      result['logged_in_user_row_id'] = user_row_id
      const get_company = await companyM.findOne({ user_row_id: user_row_id }, { _id: 1 }).lean()
      if (get_company) {
        result['login_user_company_created_status'] = true
      }
    }

    result['emp_approval_req_status'] = 0
    if ((user_row_id > 0) && (user_row_id != company_row_id)) {
      const employees_request_query = await employees_requestsM.findOne({ company_row_id: company_row_id, user_row_id: user_row_id }, { approval_status: 1 }).lean()
      if (employees_request_query) {
        result['emp_approval_req_status'] = employees_request_query.approval_status
      }
    }

    const faq_query = company_faqM.find({ company_row_id: company_row_id }, { _id: 1, faq_question: 1, faq_answer: 1 }).lean()
    const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')

    const peoples_in_company_query = professionals_work_experienceM.aggregate([
      {
        $match: {
          verified_status: true,
          company_row_id: company_row_id,
          company_type: 1,
          till_date_status: 2
        }
      },
      {
        $lookup:
        {
          from: "cln_static_professionals_work_positions",
          localField: "position_row_id",
          foreignField: "_id",
          as: "info_position",
          pipeline: [
            {
              $project: {
                _id: 1,
                position_name: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$info_position", preserveNullAndEmptyArrays: true } },
      {
        $lookup:
        {
          from: "cln_manual_user_positions",
          let: {
            position_type: '$position_type',
            sub_position_row_id: '$sub_position_row_id'
          },
          as: "manual_position_info",
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [2, "$$position_type"] },
                    { $eq: ["$_id", "$$sub_position_row_id"] }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 1,
                position_name: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$manual_position_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "cln_static_professionals_work_positions",
          let: { positions: { $ifNull: ["$positions", []] } },
          as: "resolved_static_positions",
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.position_row_id" } }]
                }
              }
            },
            { $project: { _id: 1, position_name: 1 } }
          ]
        }
      },
      {
        $lookup: {
          from: "cln_manual_user_positions",
          let: { positions: { $ifNull: ["$positions", []] } },
          as: "resolved_manual_positions",
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", { $map: { input: "$$positions", as: "p", in: "$$p.sub_position_row_id" } }]
                }
              }
            },
            { $project: { _id: 1, position_name: 1 } }
          ]
        }
      },
      {
        $lookup:
        {
          from: "cln_professionals",
          let: {
            user_row_id: '$user_row_id',
            user_account_type: '$user_account_type'
          },
          as: "user_info",
          pipeline: [
            {
              $match: {
                $and: [
                  {
                    $expr: {
                      $and: [
                        { $eq: [1, "$$user_account_type"] },
                        { $eq: ["$_id", "$$user_row_id"] }
                      ]
                    }
                  },
                  {
                    login_status: 1
                  },
                ]
              }
            },
            {
              $lookup:
              {
                from: "cln_professionals_profile_images",
                localField: "_id",
                foreignField: "user_row_id",
                as: "img_info"
              }
            },
            { $unwind: { path: "$img_info", preserveNullAndEmptyArrays: true } },
            {
              $lookup:
              {
                from: "cln_professionals_social_links",
                localField: "_id",
                foreignField: "user_row_id",
                as: "social_info",
                pipeline: [
                  {
                    $project: {
                      _id: 0,
                      website: 1,
                      facebook: 1,
                      twitter: 1,
                      linkedin: 1,
                      instagram: 1,
                      telegram: 1,
                      medium: 1,
                      reddit: 1,
                      feed_url: 1
                    }
                  }
                ]
              }
            },
            { $unwind: { path: "$social_info", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                user_name: 1,
                full_name: 1,
                email_id: 1,
                profile_image: "$img_info.profile_image",
                pro_batch: 1,
                approval_status: 1,
                social_links: "$social_info"

              }
            }
          ]
        }
      },
      { $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup:
        {
          from: "cln_professionals_manual_retrievals",
          let: {
            user_row_id: '$user_row_id',
            user_account_type: '$user_account_type'
          },
          as: "manual_info",
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [2, "$$user_account_type"] },
                    { $eq: ["$_id", "$$user_row_id"] }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 1,
                full_name: 1,
                email_id: 1,
                profile_image: 1
              }
            }
          ]
        }
      },
      { $unwind: { path: "$manual_info", preserveNullAndEmptyArrays: true } },
      {
        $set:
        {
          user_data: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [
                      { $eq: ['$user_account_type', 1] }
                    ]
                  },
                  then: "$user_info"
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$user_account_type', 2] }
                    ]
                  },
                  then: "$manual_info"
                },
              ],
              default: ""
            }
          }

        }
      },
      {
        $set: {
          user_name: "$user_data.user_name",
          full_name: "$user_data.full_name",
          position_name: { $cond: { if: { $eq: ["$position_type", 2] }, then: "$manual_position_info.position_name", else: "$info_position.position_name" } },
          positions: {
            $cond: {
              if: { $gt: [{ $size: { $ifNull: ["$positions", []] } }, 0] },
              then: {
                $map: {
                  input: { $ifNull: ["$positions", []] },
                  as: "p",
                  in: {
                    position_type: "$$p.position_type",
                    position_row_id: "$$p.position_row_id",
                    sub_position_row_id: "$$p.sub_position_row_id",
                    position_name: {
                      $cond: {
                        if: { $eq: ["$$p.position_type", 2] },
                        then: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_manual_positions", cond: { $eq: ["$$this._id", "$$p.sub_position_row_id"] } } }, in: "$$this.position_name" } }, 0] },
                        else: { $arrayElemAt: [{ $map: { input: { $filter: { input: "$resolved_static_positions", cond: { $eq: ["$$this._id", "$$p.position_row_id"] } } }, in: "$$this.position_name" } }, 0] }
                      }
                    }
                  }
                }
              },
              else: [{
                position_type: "$position_type",
                position_row_id: "$position_row_id",
                sub_position_row_id: "$sub_position_row_id",
                position_name: {
                  $cond: {
                    if: { $eq: ["$position_type", 2] },
                    then: "$manual_position_info.position_name",
                    else: "$info_position.position_name"
                  }
                }
              }]
            }
          },
        }
      },
      {
        $lookup:
        {
          from: "cln_professionals_followers",
          localField: "user_row_id",
          foreignField: "following_user_row_id",
          pipeline: [{ $match: { "follower_user_row_id": user_row_id } }],
          as: "user_followed"
        }
      },
      { $unwind: { path: "$user_followed", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          user_data: { $exists: true, $ne: "" }
        }
      },
      {
        $project: {
          _id: 1,
          user_account_type: 1,
          user_row_id: 1,
          user_name: 1,
          full_name: 1,
          email_id: "$user_data.email_id",
          profile_image: "$user_data.profile_image",
          pro_batch: "$user_data.pro_batch",
          user_approval_status: "$user_data.approval_status",
          verified_status: 1,
          designation_type: 1,
          employment_type: 1,
          position_name: 1,
          location_type: 1,
          start_date: 1,
          responsibilities: 1,
          positions: 1,
          social_links: {
            $cond: {
              if: { $eq: ["$user_account_type", 1] },
              then: "$user_data.social_links",
              else: null
            }
          },
          user_followed_status: { $cond: { if: "$user_followed.confirm_request_status", then: "$user_followed.confirm_request_status", else: 0 } },
        }
      }
    ])

    const profile_completed_percentage_data = company_profile_completed_percentage(result)

    const revenue_data = companyIndividualRevenue({ company_row_id, req })

    const event_data = companyIndividualEvents({ company_row_id, req })

    const main_business_model_id = get_query.main_business_model_id
    const similar_companies_query = companyM.aggregate([
      {
        $match: { _id: { $ne: company_row_id }, approval_status: 1, active_status: 1, main_business_model_id: main_business_model_id }
      },
      { $sort: { _id: -1 } },
      ...buildProfessionalEnrichmentStages(),

      {
        $lookup: {
          from: "cln_static_company_business_models",
          localField: "business_model_id",
          foreignField: "_id",
          as: "business_info",
          pipeline: [{ $project: { business_name: 1 } }]
        }
      },
      {
        $lookup: {
          from: "cln_static_company_business_models",
          localField: "main_business_model_id",
          foreignField: "_id",
          as: "main_business_info",
          pipeline: [{ $project: { business_name: 1 } }]
        }
      },
      { $unwind: { path: "$main_business_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "cln_static_countries",
          localField: "country_id",
          foreignField: "_id",
          as: "country_info",
          pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
        }
      },
      { $unwind: { path: "$country_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "cln_company_followers",
          localField: "_id",
          foreignField: "company_row_id",
          as: "followers_info",
          pipeline: [
            {
              $lookup:
              {
                from: "cln_professionals",
                localField: "user_row_id",
                foreignField: "_id",
                as: "inner_user_info",
                pipeline: [
                  {
                    $match: { login_status: 1 }
                  },
                  {
                    $project: {
                      _id: 1
                    }
                  }
                ]
              }
            },
            { $unwind: { path: "$inner_user_info" } },
            {
              $count: 'count'
            }
          ]
        }
      },
      {
        $lookup:
        {
          from: "cln_company_followers",
          localField: "_id",
          foreignField: "company_row_id",
          pipeline: [{ $match: { "user_row_id": user_row_id } }],
          as: "info_user_following"
        }
      },
      { $unwind: { path: "$info_user_following", preserveNullAndEmptyArrays: true } },
      {
        $lookup:
        {
          from: "cln_company_watchlists",
          localField: "_id",
          foreignField: "company_row_id",
          pipeline: [{ $match: { "user_row_id": user_row_id } }],
          as: "info_company_watchlist"
        }
      },
      { $unwind: { path: "$info_company_watchlist", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          company_name: 1,
          company_id: 1,
          company_logo: 1,
          established_in: 1,
          describe_in_one_line: 1,
          company_size_row_id: 1,
          company_location: 1,
          company_valuation: 1,
          country_flag: "$country_info.country_flag",
          country_name: "$country_info.country_name",
          main_business_model_name: "$main_business_info.business_name",
          watchlist_status: { $cond: { if: "$info_company_watchlist", then: 1, else: 0 } },
          following_status: { $cond: { if: "$info_user_following", then: 1, else: 0 } },
          total_followers: { $cond: { if: { $gt: [{ $size: "$followers_info" }, 0] }, then: "$followers_info.count", else: 0 } },
        }
      }
    ]).limit(4)

    const has_products_query = company_productsM.exists({
      company_row_id: company_row_id,
      company_type: 1
    });

    const hasHoldings_query = company_holdingM.exists({
      company_row_id,
      company_type: 1
    });

    const has_invested_query = fundingM.exists({
      investor_row_id: company_row_id,
      investor_type: 2,
      investor_registered_type: 1,
      verified_status: 1
    });

    const has_raised_query = fundingM.exists({
      funds_raised_company_row_id: company_row_id,
      funds_raised_registered_type: 1,
      verified_status: 1
    });

    const hasApplicants_query = jobsM.exists({ company_row_id, is_deleted: false });

    const [faq_list, peoples_in_company, profile_completed_percentage, revenue, event, similar_companies, has_products, hasHoldings, has_invested, has_raised, hasApplicants] = await Promise.all([faq_query, peoples_in_company_query, profile_completed_percentage_data, revenue_data, event_data, similar_companies_query, has_products_query, hasHoldings_query, has_invested_query, has_raised_query, hasApplicants_query])

    result['faq_list'] = faq_list
    result['peoples_in_company'] = peoples_in_company
    result['profile_completed_percentage'] = profile_completed_percentage
    result['revenue'] = revenue
    result['event'] = event
    result['similar_companies'] = similar_companies
    result['hasHoldings'] = !!hasHoldings;
    result['has_products'] = !!has_products;
    result['has_invested'] = !!has_invested;
    result['has_raised'] = !!has_raised;
    result['hasApplicants'] = !!hasApplicants;

    // Set cache asynchronously (non-blocking)
    redisCache.setCache({
      key,
      value: result,
      ttl: CacheDuration.THIRTY_MINUTES
    }).catch((err: Error) => console.error('Cache set error:', err));

    return { status: true, message: result, cache_response_status: false }
  }
  else {
    return { status: false, message: { alert_message: 'Invalid company row id' } }
  }
}
