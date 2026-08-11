// modules/company_revenue/company_revenue.queries.ts
import { buildPaginatedFacetStages, extractPaginatedResult } from '../common/common.pagination'
import { buildProfessionalEnrichmentStages } from '../common/common.enrichment'

export interface GetRevenueOverviewParams {
  company_row_id: number
  filterYears: number
}

/**
 * Ports controllers/app/company/revenue.js's GET /revenue_overview (lines 12-236) —
 * the Revenue tab's summary card (total revenue, years active, per-year/quarter
 * breakdown, revenue-by-stream breakdown, growth %). Pure move, no behavior
 * change: same 5 aggregates against company_revenue_growthM, same
 * revenue_growth_percentage placeholder (hardcoded to 45 before being
 * overwritten by total_revenue_growth_percentage when >=2 years of data exist —
 * preserved exactly, not something this port "cleans up").
 */
export async function getRevenueOverview({ company_row_id, filterYears }: GetRevenueOverviewParams): Promise<any> {
  const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')

  const result: any = {}

  const total_revenue_query = await company_revenue_growthM.aggregate([
    { $match: { company_row_id } },
    { $group: { _id: null, total_revenue: { $sum: '$revenue' } } }
  ])
  result.total_revenue = total_revenue_query[0] ? total_revenue_query[0].total_revenue : 0

  const get_started_year_query = await company_revenue_growthM.aggregate([
    { $match: { company_row_id } },
    { $sort: { year: 1 } },
    { $project: { _id: 1, year: 1, quarter: 1 } }
  ]).limit(1)
  result.get_started_year_query = get_started_year_query

  const get_last_year_query = await company_revenue_growthM.aggregate([
    { $match: { company_row_id } },
    { $sort: { year: -1 } },
    { $project: { _id: 1, year: 1 } }
  ]).limit(1)

  result.total_years = ''
  if (get_started_year_query[0] && get_last_year_query[0]) {
    const start_year = get_started_year_query[0].year
    const last_year = get_last_year_query[0].year
    result.total_years = start_year == last_year ? 0 : Number.parseInt(last_year) - Number.parseInt(start_year)
  }

  let yearMatch: any = { company_row_id }
  if (filterYears > 0) {
    const maxYearData = await company_revenue_growthM.findOne({ company_row_id }, { year: 1 }).sort({ year: -1 })
    const maxYear = maxYearData?.year || new Date().getFullYear()
    yearMatch.year = { $gte: maxYear - filterYears + 1, $lte: maxYear }
  }

  const checkCompanyData = await company_revenue_growthM.aggregate([
    { $match: yearMatch },
    { $group: { _id: { year: '$year', quarter: '$quarter' }, quarter_revenue: { $sum: '$revenue' } } },
    {
      $group: {
        _id: '$_id.year',
        total_revenue: { $sum: '$quarter_revenue' },
        quarters: { $push: { quarter: '$_id.quarter', revenue: '$quarter_revenue' } }
      }
    },
    { $sort: { _id: 1 } },
    { $project: { _id: '$_id', total_revenue: 1, quarters: 1 } }
  ])
  result.revenue_list_years = checkCompanyData

  const revenue_stream_query = await company_revenue_growthM.aggregate([
    { $match: { company_row_id, 'revenue_streams.category_row_id': { $gte: 1 } } },
    { $unwind: { path: '$revenue_streams' } },
    { $group: { _id: '$revenue_streams.category_row_id', total: { $sum: '$revenue_streams.stream_amount' } } },
    {
      $lookup: {
        from: 'cln_static_company_revenue_streams',
        localField: '_id',
        foreignField: '_id',
        as: 'info_revenue_streams',
        pipeline: [{ $project: { _id: 1, category_name: 1 } }]
      }
    },
    { $unwind: { path: '$info_revenue_streams', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, total: 1, category_name: '$info_revenue_streams.category_name' } }
  ])
  result.revenue_stream_list = revenue_stream_query

  result.revenue_growth_percentage = 45
  if (checkCompanyData.length >= 2) {
    const startRevenue = checkCompanyData[0].total_revenue
    const endRevenue = checkCompanyData[checkCompanyData.length - 1].total_revenue

    if (startRevenue > 0) {
      const growth = ((endRevenue - startRevenue) / startRevenue) * 100
      result.total_revenue_growth_percentage = Math.round(growth * 100) / 10
      result.startRevenue = startRevenue
      result.endRevenue = endRevenue
    } else {
      result.total_revenue_growth_percentage = null
    }
  } else {
    result.total_revenue_growth_percentage = null
  }

  return result
}

export interface GetRevenueListParams {
  company_row_id: number
  skip: number
  limit: number
  year?: string
  quarter?: string
  revenue_stream?: string
}

export interface GetRevenueListResult {
  data: any[]
  count: number
}

/**
 * Ports controllers/app/company/revenue.js's GET /list/:company_row_id/:skip/:limit
 * (lines 395-550).
 *
 * CONFIRMED BUG FIX (Part 1 §3 finding 3, Part 3 §7 Phase D step 1): the real
 * source ran the paginated list aggregate (which applies the optional
 * revenue_stream filter, via `revenue_streams_list.$elemMatch`) and a SEPARATE
 * `countDocuments(search_query)` for the total — where search_query only ever
 * carried company_row_id/year/quarter, never revenue_stream. Whenever a caller
 * filtered by revenue_stream, the displayed count silently disagreed with the
 * actual list (count included every revenue record for the company/year/quarter,
 * list showed only the ones matching that revenue stream). Fixed by running the
 * ENTIRE filter pipeline (including the revenue_stream match) once, then
 * splitting into paginated-data vs total-count via
 * common.pagination.ts's buildPaginatedFacetStages() — list and count now
 * structurally can't drift apart, since they're two branches of the same $facet
 * over the same upstream document set.
 */
export async function getRevenueList(params: GetRevenueListParams): Promise<GetRevenueListResult> {
  const { company_row_id, skip, limit, year, quarter, revenue_stream } = params
  const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')

  const query: any[] = [{ company_row_id }]
  if (year) query.push({ year: Number.parseInt(year) })
  if (quarter) query.push({ quarter: Number.parseInt(quarter) })
  const search_query = { $and: query }

  const facetResult = await company_revenue_growthM.aggregate([
    { $match: search_query },
    { $sort: { year: -1, quarter: 1 } },
    {
      $lookup: {
        from: 'cln_static_company_revenue_streams',
        localField: 'revenue_streams.category_row_id',
        foreignField: '_id',
        as: 'info_revenue_streams',
        pipeline: [{ $project: { _id: 1, category_name: 1 } }]
      }
    },
    {
      $addFields: {
        revenue_streams_list: {
          $map: {
            input: '$revenue_streams',
            as: 'c',
            in: {
              category_row_id: '$$c.category_row_id',
              stream_amount: '$$c.stream_amount',
              category_name: {
                $arrayElemAt: [
                  '$info_revenue_streams.category_name',
                  { $indexOfArray: ['$info_revenue_streams._id', '$$c.category_row_id'] }
                ]
              }
            }
          }
        }
      }
    },
    ...(revenue_stream ? [{
      $match: {
        revenue_streams_list: { $elemMatch: { category_row_id: Number.parseInt(revenue_stream) } }
      }
    }] : []),
    {
      $project: {
        _id: 1,
        company_row_id: 1,
        year: 1,
        quarter: 1,
        revenue: 1,
        revenue_streams_list: 1
      }
    },
    ...buildPaginatedFacetStages({ skip, limit })
  ])

  return extractPaginatedResult(facetResult)
}

export interface CompanyRevenueReportListParams {
  query: any
  skip: number
  limit: number
  user_row_id: number
  boundingBox?: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null
}

/**
 * Ports services/company/front_page.ts's companyList() report_list_type===5 branch
 * (Part 3 §7 Phase D step 2) — the "Revenue Report" tab on the companies list page.
 *
 * CONFIRMED ARCHITECTURAL FIX (Part 1 §3 finding 3, blanket decision — "fix every
 * one, not just the ones already scoped"): the real source already ran list and
 * count from one shared `basePipeline` (via Promise.all of two separately-built
 * pipelines), so there was no LIVE filter-mismatch bug here (unlike revenue.js's
 * /list) — but it's still the same list+separate-count architecture the decision
 * covers. Converted to a single aggregate ending in
 * common.pagination.ts's buildPaginatedFacetStages(), structurally removing the
 * possibility of the two ever drifting apart in a future edit. Every stage,
 * lookup, and field name is otherwise byte-for-byte the same as the real
 * basePipeline — including keeping the enrichment lookups (business models,
 * country, followers, watchlist/following) BEFORE the $skip/$limit split
 * (real, pre-existing behavior: these lookups run against every matching
 * document, not just the current page) — Phase D step 2 does not include a
 * performance pass on this branch, only the count/list architecture fix.
 */
export async function getCompanyRevenueReportList(params: CompanyRevenueReportListParams): Promise<{ list: any[]; count: number }> {
  const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')
  const { query, skip, limit, user_row_id, boundingBox } = params

  const facetResult = await company_revenue_growthM.aggregate([
    { $sort: { year: -1, quarter: -1 } },
    {
      $group: {
        _id: '$company_row_id',
        pushed_data: {
          $push: {
            $cond: [
              { $lt: ['$quarter', 5] },
              { _id: '$_id', year: '$year', quarter: '$quarter', revenue: '$revenue' },
              '$$REMOVE'
            ]
          }
        },
        total_revenue: { $sum: '$revenue' }
      }
    },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: '_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          ...buildProfessionalEnrichmentStages(),
          {
            $project: {
              company_name: 1, company_id: 1, company_logo: 1, company_location: 1, company_valuation: 1,
              business_model_id: 1, describe_in_one_line: 1, main_business_model_id: 1, country_id: 1,
              latitude: 1, longitude: 1
            }
          }
        ]
      }
    },
    { $unwind: '$company_info' },
    {
      $addFields: {
        lat_num: { $convert: { input: '$company_info.latitude', to: 'double', onError: null, onNull: null } },
        lon_num: { $convert: { input: '$company_info.longitude', to: 'double', onError: null, onNull: null } }
      }
    },
    ...(boundingBox ? [{
      $match: {
        lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat },
        lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon }
      }
    }] : []),
    { $sort: { total_revenue: -1 } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_location: '$company_info.company_location',
        business_model_id: '$company_info.business_model_id',
        main_business_model_id: '$company_info.main_business_model_id',
        country_id: '$company_info.country_id',
        company_valuation: '$company_info.company_valuation',
        latitude: '$company_info.latitude',
        longitude: '$company_info.longitude',
        revenue_growth: {
          $cond: [
            {
              $and: [
                { $gte: [{ $size: '$pushed_data' }, 2] },
                { $ne: [{ $arrayElemAt: ['$pushed_data.revenue', 1] }, 0] }
              ]
            },
            {
              $multiply: [
                {
                  $divide: [
                    { $subtract: [{ $arrayElemAt: ['$pushed_data.revenue', 0] }, { $arrayElemAt: ['$pushed_data.revenue', 1] }] },
                    { $arrayElemAt: ['$pushed_data.revenue', 1] }
                  ]
                },
                100
              ]
            },
            0
          ]
        }
      }
    },
    { $match: query },
    // PRESERVED, CONFIRMED PRE-EXISTING BEHAVIOR: unlike every other unwind in this pipeline, this
    // $unwind has no preserveNullAndEmptyArrays — it silently drops any company with no matching
    // cln_static_countries row (2 of 217 in live testing, 2026-08-11), acting as an implicit filter
    // rather than pure display enrichment. It must stay ahead of pagination so totalCount keeps
    // reflecting this existing behavior; moving it into the facet's `data` branch (as first attempted)
    // inflated the live count from 215 to 217 — a functional change this fix must not introduce.
    {
      $lookup: {
        from: 'cln_static_countries',
        localField: 'country_id',
        foreignField: '_id',
        as: 'country_info',
        pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
      }
    },
    { $unwind: '$country_info' },
    // CONFIRMED PERF FIX (live testing, 2026-08-11): same bug shape as company_admin.list.queries.ts's
    // buildCompanyListPipeline — the remaining 5 lookups below (main_business_info/business_info/
    // followers/following/watchlist) are pure display enrichment, only read in the final $project, so
    // they used to run against every matching company before $skip/$limit. Moved inside the $facet's
    // `data` branch so they only run on the current page; company_info above stays ahead of pagination
    // since it feeds the boundingBox filter and the $set fields the `query` $match above depends on.
    // (Ordering is already established by the $sort at line 284, above — untouched by $set/$match.)
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'cln_static_company_business_models',
              localField: 'main_business_model_id',
              foreignField: '_id',
              as: 'main_business_info',
              pipeline: [{ $project: { business_name: 1 } }]
            }
          },
          { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_static_company_business_models',
              localField: 'business_model_id',
              foreignField: '_id',
              as: 'business_info',
              pipeline: [{ $project: { business_name: 1 } }]
            }
          },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: '_id',
              foreignField: 'company_row_id',
              as: 'followers_info',
              pipeline: [
                {
                  $lookup: {
                    from: 'cln_professionals',
                    localField: 'user_row_id',
                    foreignField: '_id',
                    as: 'inner_user_info',
                    pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }]
                  }
                },
                { $unwind: '$inner_user_info' },
                { $count: 'count' }
              ]
            }
          },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: '_id',
              foreignField: 'company_row_id',
              pipeline: [{ $match: { user_row_id: user_row_id } }],
              as: 'info_user_following'
            }
          },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_watchlists',
              localField: '_id',
              foreignField: 'company_row_id',
              pipeline: [{ $match: { user_row_id: user_row_id } }],
              as: 'info_company_watchlist'
            }
          },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1, company_name: 1, company_id: 1, total_revenue: 1, company_location: 1, main_business_model_id: 1,
              country_id: 1, revenue_growth: 1, latitude: 1, longitude: 1, lat_num: 1, lon_num: 1, pushed_data: 1,
              company_logo: '$company_info.company_logo', describe_in_one_line: '$company_info.describe_in_one_line',
              country_flag: '$country_info.country_flag', country_name: '$country_info.country_name',
              business_name: '$business_info.business_name', company_valuation: 1,
              main_business_model_name: '$main_business_info.business_name',
              watchlist_status: { $cond: { if: '$info_company_watchlist', then: 1, else: 0 } },
              following_status: { $cond: { if: '$info_user_following', then: 1, else: 0 } },
              total_followers: { $cond: { if: { $gt: [{ $size: '$followers_info' }, 0] }, then: '$followers_info.count', else: 0 } }
            }
          }
        ],
        totalCount: [{ $count: 'count' }]
      }
    }
  ])

  const { data, count } = extractPaginatedResult(facetResult)
  return { list: data, count }
}

export interface PartnerRevenueReportListParams {
  searchArray: any[]
  skip: number
  limit: number
  user_row_id: number
}

/**
 * Ports services/company/front_page.ts's partnersList() report_list_type===5
 * branch (Part 3 §7 Phase D step 2) — the partner-side equivalent of
 * getCompanyRevenueReportList above.
 *
 * CONFIRMED ARCHITECTURAL FIX, same reasoning as getCompanyRevenueReportList:
 * unlike the company-side branch, the real source here wrote the list and count
 * aggregates as two SEPARATELY hand-duplicated pipelines (not a shared
 * `basePipeline` variable) — confirmed byte-for-byte identical up through the
 * `$match: { $and: searchArray }` stage before diverging (list continues into
 * the display enrichment lookups + $skip/$limit, count jumps straight to
 * $count) before merging into one $facet-terminated pipeline. No boundingBox
 * support here (real, confirmed — the partner-side function signature never
 * had it, unlike the company-side one); not something this port adds.
 */
export async function getPartnerRevenueReportList(params: PartnerRevenueReportListParams): Promise<{ list: any[]; count: number }> {
  const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')
  const { searchArray, skip, limit, user_row_id } = params

  const facetResult = await company_revenue_growthM.aggregate([
    { $sort: { year: -1, quarter: -1 } },
    {
      $group: {
        _id: '$company_row_id',
        pushed_data: {
          $push: {
            $cond: {
              if: { $lt: ['$quarter', 5] },
              then: { _id: '$_id', year: '$year', quarter: '$quarter', revenue: '$revenue' },
              else: '$$REMOVE'
            }
          }
        },
        total_revenue: { $sum: '$revenue' }
      }
    },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: '_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          {
            $lookup: {
              from: 'cln_company_added_to_partners',
              localField: '_id',
              foreignField: 'company_row_id',
              as: 'info_parnters',
              pipeline: [{ $project: { _id: 1 } }]
            }
          },
          { $unwind: { path: '$info_parnters' } },
          ...buildProfessionalEnrichmentStages(),
          {
            $project: {
              company_name: 1, company_id: 1, company_logo: 1, company_location: 1, company_valuation: 1,
              business_model_id: 1, describe_in_one_line: 1, main_business_model_id: 1, country_id: 1,
              latitude: 1, longitude: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: '$company_info' } },
    { $sort: { total_revenue: -1 } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_location: '$company_info.company_location',
        business_model_id: '$company_info.business_model_id',
        main_business_model_id: '$company_info.main_business_model_id',
        country_id: '$company_info.country_id',
        company_valuation: '$company_info.company_valuation',
        revenue_growth: {
          $multiply: [
            {
              $divide: [
                { $subtract: [{ $arrayElemAt: ['$pushed_data.revenue', 0] }, { $arrayElemAt: ['$pushed_data.revenue', 1] }] },
                { $arrayElemAt: ['$pushed_data.revenue', 1] }
              ]
            },
            100
          ]
        }
      }
    },
    { $match: { $and: searchArray } },
    // CONFIRMED PERF FIX (live testing, 2026-08-11): same bug shape as getCompanyRevenueReportList
    // above — the 6 display-only lookups used to run on every matching company before $skip/$limit.
    // Moved inside the $facet's `data` branch; company_info stays ahead of pagination since it feeds
    // the $set fields the searchArray $match above depends on. Ordering already fixed by the $sort
    // at line 499, above — untouched by $set/$match.
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'cln_static_company_business_models',
              localField: 'main_business_model_id',
              foreignField: '_id',
              as: 'main_business_info',
              pipeline: [{ $project: { business_name: 1 } }]
            }
          },
          { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_static_company_business_models',
              localField: 'business_model_id',
              foreignField: '_id',
              as: 'business_info',
              pipeline: [{ $project: { business_name: 1 } }]
            }
          },
          {
            $lookup: {
              from: 'cln_static_countries',
              localField: 'country_id',
              foreignField: '_id',
              as: 'country_info',
              pipeline: [{ $project: { country_name: 1, country_flag: 1 } }]
            }
          },
          { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: '_id',
              foreignField: 'company_row_id',
              as: 'followers_info',
              pipeline: [
                {
                  $lookup: {
                    from: 'cln_professionals',
                    localField: 'user_row_id',
                    foreignField: '_id',
                    as: 'inner_user_info',
                    pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }]
                  }
                },
                { $unwind: { path: '$inner_user_info' } },
                { $count: 'count' }
              ]
            }
          },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: '_id',
              foreignField: 'company_row_id',
              pipeline: [{ $match: { user_row_id: user_row_id } }],
              as: 'info_user_following'
            }
          },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_watchlists',
              localField: '_id',
              foreignField: 'company_row_id',
              pipeline: [{ $match: { user_row_id: user_row_id } }],
              as: 'info_company_watchlist'
            }
          },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1, company_row_id: '$_id', company_name: 1, company_id: 1, total_revenue: 1, company_location: 1,
              main_business_model_id: 1, country_id: 1, pushed_data: 1, revenue_growth: 1,
              company_logo: '$company_info.company_logo', describe_in_one_line: '$company_info.describe_in_one_line',
              country_flag: '$country_info.country_flag', country_name: '$country_info.country_name',
              company_valuation: 1, latitude: '$company.latitude', longitude: '$company.longitude',
              business_name: '$business_info.business_name', main_business_model_name: '$main_business_info.business_name',
              watchlist_status: { $cond: { if: '$info_company_watchlist', then: 1, else: 0 } },
              following_status: { $cond: { if: '$info_user_following', then: 1, else: 0 } },
              total_followers: { $cond: { if: { $gt: [{ $size: '$followers_info' }, 0] }, then: '$followers_info.count', else: 0 } }
            }
          }
        ],
        totalCount: [{ $count: 'count' }]
      }
    }
  ])

  const { data, count } = extractPaginatedResult(facetResult)
  return { list: data, count }
}

/**
 * Ports controllers/admin_panel/app/company.js's GET
 * /revenue_individual/:request_row_id (lines 4933-4961) — admin's single-record
 * detail view. Returns the raw document (or null), matching the real source's
 * plain findOne with no projection/enrichment.
 */
export async function getRevenueIndividualAdmin(revenueRowId: number): Promise<any | null> {
  const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')
  return company_revenue_growthM.findOne({ _id: revenueRowId })
}

export interface GetRevenueListAdminResult {
  list: any[]
  count: number
}

/**
 * Ports controllers/admin_panel/app/company.js's GET
 * /revenue_list/:company_row_id (lines 4963-4997) — admin's plain, unpaginated
 * list for a given company (sorted by year desc), plus a separate count. Not
 * changed to $facet: unlike revenue.js's /list and the companyList/partnersList
 * branches above, list and count here run the SAME, unfiltered
 * `{ company_row_id }` match — there's no possibility of the two disagreeing,
 * so this isn't an instance of the Part 1 §3 finding 3 anti-pattern.
 */
export async function getRevenueListAdmin(companyRowId: number): Promise<GetRevenueListAdminResult> {
  const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')
  const [list, count] = await Promise.all([
    company_revenue_growthM.find({ company_row_id: companyRowId }).sort({ year: -1 }),
    company_revenue_growthM.countDocuments({ company_row_id: companyRowId })
  ])
  return { list, count }
}

export interface GetCompanyProfileRevenueSummaryParams {
  company_row_id: number
  req: any
}

/**
 * Ports the original services/company/front_page.ts's companyIndividualRevenue
 * (Part 3 §7 Phase D step 4) — the company profile page's Revenue-tab summary,
 * called from modules/company/company.service.ts's getCompanyOtherDetails().
 * Distinct from getRevenueOverview above: different output shape (recent/list/
 * list2/count/list_by_year/total_revenue vs. total_revenue/total_years/
 * revenue_list_years/revenue_stream_list/revenue_growth_percentage), driven by
 * year/quarter/revenue_streams query params directly rather than a single
 * filterYears window — a genuinely different view, not the same query
 * duplicated. Pure move, no behavior change.
 */
export async function getCompanyProfileRevenueSummary({ company_row_id, req }: GetCompanyProfileRevenueSummaryParams): Promise<any> {
  const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')
  const result: any = {}
  const matchFilter: any = { company_row_id }

  if (req?.query?.year && !Number.isNaN(Number.parseInt(req.query.year))) {
    matchFilter.year = Number.parseInt(req.query.year)
  }
  if (req?.query?.quarter && !Number.isNaN(Number.parseInt(req.query.quarter))) {
    matchFilter.quarter = Number.parseInt(req.query.quarter)
  }

  result.recent = await company_revenue_growthM.findOne({ company_row_id }).sort({ _id: -1 }).lean()

  result.list = await company_revenue_growthM.aggregate([
    { $match: matchFilter },
    { $group: { _id: '$year', total_revenue: { $sum: '$revenue' } } },
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: 'cln_company_revenue_details',
        localField: '_id',
        foreignField: 'year',
        as: 'info_quarter_list',
        pipeline: [
          {
            $match: {
              company_row_id,
              ...(req?.query?.quarter && !Number.isNaN(Number.parseInt(req.query.quarter))
                ? { quarter: Number.parseInt(req.query.quarter) }
                : {})
            }
          },
          { $sort: { quarter: -1 } },
          {
            $lookup: {
              from: 'cln_static_company_revenue_streams',
              localField: 'revenue_streams.category_row_id',
              foreignField: '_id',
              as: 'info_revenue_streams',
              pipeline: [{ $project: { _id: 1, category_name: 1 } }]
            }
          },
          {
            $addFields: {
              revenue_streams_list: {
                $map: {
                  input: '$revenue_streams',
                  as: 'c',
                  in: {
                    category_row_id: '$$c.category_row_id',
                    stream_amount: '$$c.stream_amount',
                    category_name: {
                      $arrayElemAt: [
                        '$info_revenue_streams.category_name',
                        { $indexOfArray: ['$info_revenue_streams._id', '$$c.category_row_id'] }
                      ]
                    }
                  }
                }
              }
            }
          },
          ...(req.query.revenue_streams ? [{
            $match: {
              revenue_streams_list: { $elemMatch: { category_row_id: Number.parseInt(req.query.revenue_streams) } }
            }
          }] : []),
          { $project: { _id: 1, quarter: 1, revenue: 1, revenue_streams_list: 1 } }
        ]
      }
    },
    { $match: { info_quarter_list: { $ne: [] } } },
    { $project: { _id: 0, year: '$_id', total_revenue: 1, quarter_list: '$info_quarter_list' } }
  ])

  result.list2 = await company_revenue_growthM.aggregate([
    { $match: matchFilter },
    { $sort: { year: -1, quarter: 1 } },
    { $group: { _id: '$year', quarters: { $push: '$quarter' }, total_revenue: { $sum: '$revenue' } } },
    { $project: { _id: 0, year: '$_id', quarters: 1, total_revenue: 1 } },
    { $sort: { year: -1 } }
  ])

  const revenue_count_query = await company_revenue_growthM.aggregate([
    { $match: { company_row_id } },
    { $group: { _id: '$year' } },
    { $count: 'count' }
  ])
  result.count = revenue_count_query[0] ? revenue_count_query[0].count : 0

  result.list_by_year = await company_revenue_growthM.aggregate([
    { $match: { company_row_id } },
    { $group: { _id: '$year', total_revenue: { $sum: '$revenue' } } },
    { $sort: { _id: 1 } }
  ])

  const total_revenue_query = await company_revenue_growthM.aggregate([
    { $match: { company_row_id } },
    { $group: { _id: null, total_revenue: { $sum: '$revenue' } } }
  ])
  result.total_revenue = total_revenue_query[0] ? total_revenue_query[0].total_revenue : 0

  return result
}

/**
 * The original (pre-Phase-D) implementation of the same Revenue-tab summary as
 * getCompanyProfileRevenueSummary above, superseded by it but kept — not a
 * separate HTTP endpoint of its own (it was always an internal helper of the
 * legacy individual_other_details handler, never independently routable), so
 * there's no URL for an external consumer to depend on. Kept in its natural
 * home rather than a separate "dead code" file, per the FINAL PHASE decision:
 * some ported-as-flagged code may still be relied on by consumers outside the
 * two frontend repos this engagement audited, so nothing gets deleted or
 * quarantined — it just lives where it topically belongs.
 */
export const companyIndividualRevenue = async ({ company_row_id, req }: { company_row_id: number, req: any }) => {
  const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')
  let result: any = {}
  let matchFilter: any = { company_row_id };

  if (req?.query?.year && !Number.isNaN(Number.parseInt(req.query.year))) {
    matchFilter.year = Number.parseInt(req.query.year);
  }

  if (req?.query?.quarter && !Number.isNaN(Number.parseInt(req.query.quarter))) {
    matchFilter.quarter = Number.parseInt(req.query.quarter);
  }

  result['recent'] = await company_revenue_growthM.findOne({ company_row_id: company_row_id }).sort({ _id: -1 }).lean()

  result['list'] = await company_revenue_growthM.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: "$year",
        total_revenue: { $sum: "$revenue" }
      }
    },
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: "cln_company_revenue_details",
        localField: "_id",
        foreignField: "year",
        as: "info_quarter_list",
        pipeline: [
          {
            $match: {
              company_row_id: company_row_id,
              ...(req?.query?.quarter && !Number.isNaN(Number.parseInt(req.query.quarter))
                ? { quarter: Number.parseInt(req.query.quarter) }
                : {})
            }
          },
          { $sort: { quarter: -1 } },
          {
            $lookup: {
              from: "cln_static_company_revenue_streams",
              localField: "revenue_streams.category_row_id",
              foreignField: "_id",
              as: "info_revenue_streams",
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    category_name: 1
                  }
                }
              ]
            }
          },
          {
            $addFields: {
              revenue_streams_list: {
                $map: {
                  input: "$revenue_streams",
                  as: "c",
                  in: {
                    category_row_id: "$$c.category_row_id",
                    stream_amount: "$$c.stream_amount",
                    category_name: {
                      $arrayElemAt: [
                        "$info_revenue_streams.category_name",
                        {
                          $indexOfArray: [
                            "$info_revenue_streams._id",
                            "$$c.category_row_id"
                          ]
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          ...(req.query.revenue_streams ? [{
            $match: {
              revenue_streams_list: {
                $elemMatch: {
                  category_row_id: Number.parseInt(req.query.revenue_streams)
                }
              }
            }
          }] : []),
          {
            $project: {
              _id: 1,
              quarter: 1,
              revenue: 1,
              revenue_streams_list: 1
            }
          }
        ]
      }
    },
    {
      $match: {
        info_quarter_list: { $ne: [] }
      }
    },
    {
      $project: {
        _id: 0,
        year: "$_id",
        total_revenue: 1,
        quarter_list: "$info_quarter_list"
      }
    }
  ])

  result['list2'] = await company_revenue_growthM.aggregate([
    { $match: matchFilter },
    { $sort: { year: -1, quarter: 1 } },
    {
      $group: {
        _id: "$year",
        quarters: { $push: "$quarter" },
        total_revenue: { $sum: "$revenue" }
      }
    },
    { $project: { _id: 0, year: "$_id", quarters: 1, total_revenue: 1 } },
    { $sort: { year: -1 } }
  ])

  const revenue_count_query = await company_revenue_growthM.aggregate([
    { $match: { company_row_id: company_row_id } },
    {
      $group: {
        _id: "$year",
      }
    },
    {
      $count: 'count'
    }
  ])

  result['count'] = revenue_count_query[0] ? revenue_count_query[0].count : 0
  result['list_by_year'] = await company_revenue_growthM.aggregate([
    { $match: { company_row_id: company_row_id } },
    { $group: { _id: "$year", total_revenue: { $sum: "$revenue" } } },
    { $sort: { _id: 1 } }
  ])

  const total_revenue_query = await company_revenue_growthM.aggregate([
    { $match: { company_row_id: company_row_id } },
    { $group: { _id: null, total_revenue: { $sum: "$revenue" } } }
  ])
  result['total_revenue'] = total_revenue_query[0] ? total_revenue_query[0].total_revenue : 0
  return result
}

/**
 * Ports the admin dashboard's total_revenue stat (company.js's company_individual_overview,
 * Part 3 §7 Phase H step 5) — delegated here from modules/company_admin/. A separate, lighter
 * export from getRevenueOverview above (which computes a much larger Revenue-tab summary): this
 * one is just the single sum this specific dashboard card needs.
 */
export function buildCompanyTotalRevenuePipeline(companyRowId: number) {
  return [
    { $match: { company_row_id: companyRowId } },
    { $group: { _id: null, total: { $sum: '$revenue' } } },
  ]
}

/**
 * Ports the admin dashboard's last_year_revenue stat (company.js's company_individual_overview,
 * Part 3 §7 Phase H step 5).
 *
 * CONFIRMED BUG FIX: the real source grouped by `$year` and took `$limit: 1` with NO `$sort`
 * stage beforehand — MongoDB doesn't guarantee $group output order, so "last year" was actually
 * an arbitrary year, not the most recent one. This codebase's own established pattern for
 * finding the latest year (`get_started_year_query`/`get_last_year_query` above, both sorted)
 * confirms this was an oversight, not intentional. Fixed by sorting `{ _id: -1 }` (descending
 * year) before limiting.
 */
export function buildCompanyLastYearRevenuePipeline(companyRowId: number) {
  return [
    { $match: { company_row_id: companyRowId } },
    { $group: { _id: '$year', total: { $sum: '$revenue' } } },
    { $sort: { _id: -1 } },
    { $limit: 1 },
    { $project: { _id: 0, total: 1 } },
  ]
}
