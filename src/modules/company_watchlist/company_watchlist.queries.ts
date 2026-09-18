// modules/company_watchlist/company_watchlist.queries.ts

/** A single Mongo match-condition fragment as used inside this module's `$and: searchArray` filters. */
export type WatchlistSearchCondition =
  | Record<string, never>
  | { $or: Array<{ company_name: { $regex: string; $options: string } } | { company_id: { $regex: string; $options: string } }> }
  | { business_model_id: { $in: number[] } }
  | { company_location: { $regex: string; $options: string } }

/** Shape of a `cln_company_watchlists` document (see models/app/watchlist/companyM.js). */
export interface WatchlistDoc {
  _id: number
  company_row_id: number
  user_row_id: number
  last_email_sent_on: Date | null
  date_n_time: Date
}

/** Shape of the aggregation pipeline's per-row output after buildWatchlistListPipeline's final $project. */
export interface WatchlistListRow {
  _id: number
  company_row_id: number
  company_name: string
  company_id: string
  company_location: string
  company_size_row_id: number
  company_valuation: number
  describe_in_one_line: string
  established_in: Date
  company_logo: string
  main_business_model_name: string
  business_name: string
  country_flag: string
  country_name: string
  following_status: 0 | 1
  total_followers: number
}

export interface WatchlistAggregateFacetResult {
  data: WatchlistListRow[]
  totalCount: Array<{ count: number }>
}

/** Ports company.js (watchlist)'s GET /list/:skip/:limit search-condition building (lines 183-196) verbatim. */
export function buildWatchlistSearchConditions({
  search,
  businessModelIds,
  location,
}: {
  search?: string
  businessModelIds?: number[]
  location?: string
}): WatchlistSearchCondition[] {
  const searchArray: WatchlistSearchCondition[] = [{}]

  if (search) {
    searchArray.push({ $or: [{ company_name: { $regex: search, $options: 'i' } }, { company_id: { $regex: search, $options: 'i' } }] })
  }

  if (businessModelIds && businessModelIds.length > 0) {
    searchArray.push({ business_model_id: { $in: businessModelIds } })
  }

  if (location) {
    searchArray.push({ company_location: { $regex: location, $options: 'i' } })
  }

  return searchArray
}

const COMPANY_INFO_LOOKUP = {
  $lookup: {
    from: 'cln_company_lists',
    localField: 'company_row_id',
    foreignField: '_id',
    as: 'company_info',
    pipeline: [
      { $match: { approval_status: 1, active_status: 1 } },
      {
        $lookup: {
          from: 'cln_professionals',
          localField: 'user_row_id',
          foreignField: '_id',
          as: 'user_info',
          pipeline: [{ $match: { login_status: { $ne: 1 } } }, { $project: { _id: 1, login_status: 1 } }],
        },
      },
      { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
      { $set: { login_status: { $cond: { if: '$user_info.login_status', then: '$user_info.login_status', else: 1 } } } },
      { $match: { login_status: 1 } },
      {
        $lookup: {
          from: 'cln_static_company_business_models',
          localField: 'business_model_id',
          foreignField: '_id',
          as: 'business_info',
          pipeline: [{ $project: { business_name: 1 } }],
        },
      },
      {
        $lookup: {
          from: 'cln_static_company_business_models',
          localField: 'main_business_model_id',
          foreignField: '_id',
          as: 'main_business_info',
          pipeline: [{ $project: { _id: 0, business_name: 1 } }],
        },
      },
      { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'cln_static_countries',
          localField: 'country_id',
          foreignField: '_id',
          as: 'country_info',
          pipeline: [{ $project: { _id: 0, country_name: 1, country_flag: 1 } }],
        },
      },
      { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          describe_in_one_line: 1,
          established_in: 1,
          company_name: 1,
          company_id: 1,
          company_logo: 1,
          company_location: 1,
          country_id: 1,
          business_model_id: 1,
          company_size_row_id: 1,
          company_valuation: 1,
          country_name: '$country_info.country_name',
          country_flag: '$country_info.country_flag',
          main_business_model_name: '$main_business_info.business_name',
          business_name: '$business_info.business_name',
        },
      },
    ],
  },
}

/**
 * Ports company.js (watchlist)'s GET /list/:skip/:limit (lines 174-512), $facet-converted per the
 * standing list+count fix. The real source ran the data pipeline and the count pipeline as two
 * independently hand-typed aggregations — the count one used a lighter `company_info` lookup
 * (missing the business/country lookups), which made no difference to the final count, so the
 * heavier data-pipeline lookup is used for both branches here without changing behavior. The
 * follower/following lookups (only meaningful for display, not counting) live inside the `data`
 * branch only, so the `totalCount` branch does the least work needed to get a correct count.
 */
export function buildWatchlistListPipeline({ userRowId, searchArray, skip, limit }: { userRowId: number; searchArray: WatchlistSearchCondition[]; skip: number; limit: number }) {
  return [
    { $sort: { _id: -1 } },
    { $match: { user_row_id: userRowId } },
    COMPANY_INFO_LOOKUP,
    { $unwind: { path: '$company_info' } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_location: '$company_info.company_location',
        business_model_id: '$company_info.business_model_id',
      },
    },
    { $match: { $and: searchArray } },
    {
      $facet: {
        data: [
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: 'company_row_id',
              foreignField: 'company_row_id',
              as: 'followers_info',
              pipeline: [
                {
                  $lookup: {
                    from: 'cln_professionals',
                    localField: 'user_row_id',
                    foreignField: '_id',
                    as: 'inner_user_info',
                    pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }],
                  },
                },
                { $unwind: { path: '$inner_user_info' } },
                { $count: 'count' },
              ],
            },
          },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: 'company_row_id',
              foreignField: 'company_row_id',
              pipeline: [{ $match: { user_row_id: userRowId } }],
              as: 'info_user_following',
            },
          },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              company_row_id: 1,
              company_name: 1,
              company_id: 1,
              company_location: 1,
              company_size_row_id: '$company_info.company_size_row_id',
              company_valuation: '$company_info.company_valuation',
              describe_in_one_line: '$company_info.describe_in_one_line',
              established_in: '$company_info.established_in',
              company_logo: '$company_info.company_logo',
              main_business_model_name: '$company_info.main_business_model_name',
              business_name: '$company_info.business_name',
              country_flag: '$company_info.country_flag',
              country_name: '$company_info.country_name',
              following_status: { $cond: { if: '$info_user_following', then: 1, else: 0 } },
              total_followers: { $cond: { if: { $gt: [{ $size: '$followers_info' }, 0] }, then: '$followers_info.count', else: 0 } },
            },
          },
          { $skip: skip },
          { $limit: limit },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractWatchlistPaginatedResult(aggregateOutput: WatchlistAggregateFacetResult[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return {
    data: facetResult.data,
    count: facetResult.totalCount[0]?.count ?? 0,
  }
}

/**
 * Repository-layer wrapper for company.js (watchlist)'s GET /add_to_watchlist/:company_row_id's
 * `companyM.findOne({...}, {_id:1})` approval/active-status check — moved out of the service so
 * the service never touches a Mongoose model directly (CLAUDE.md's "repository/service layer"
 * data-access rule).
 */
export async function findApprovedActiveCompanyById(companyRowId: number): Promise<{ _id: number } | null> {
  const companyM = require('../../../models/app/company/companyM')
  return companyM.findOne({ _id: companyRowId, approval_status: 1, active_status: 1 }, { _id: 1 })
}

export interface UpsertWatchlistEntryParams {
  companyRowId: number
  userRowId: number
  nextId: number
  dateNTime: Date
}

/** Shape of Mongoose's findOneAndUpdate result when called with `includeResultMetadata: true`. */
export interface WatchlistUpsertResult {
  value: WatchlistDoc | null
  lastErrorObject?: { updatedExisting?: boolean; upserted?: number }
}

/**
 * Repository-layer wrapper for the atomic upsert in addToWatchlist (the confirmed race-condition
 * fix documented on that function) — `company_watchlistM.findOneAndUpdate(..., {upsert:true})`.
 */
export async function upsertWatchlistEntry({ companyRowId, userRowId, nextId, dateNTime }: UpsertWatchlistEntryParams): Promise<WatchlistUpsertResult> {
  const company_watchlistM = require('../../../models/app/watchlist/companyM')
  return company_watchlistM.findOneAndUpdate(
    { company_row_id: companyRowId, user_row_id: userRowId },
    { $setOnInsert: { _id: nextId, company_row_id: companyRowId, user_row_id: userRowId, last_email_sent_on: null, date_n_time: dateNTime } },
    { upsert: true, new: false, includeResultMetadata: true },
  )
}

/** Repository-layer wrapper for removeFromWatchlist's `company_watchlistM.findOneAndDelete(...)`. */
export async function deleteWatchlistEntry({ companyRowId, userRowId }: { companyRowId: number; userRowId: number }): Promise<WatchlistDoc | null> {
  const company_watchlistM = require('../../../models/app/watchlist/companyM')
  return company_watchlistM.findOneAndDelete({ company_row_id: companyRowId, user_row_id: userRowId })
}

/** Repository-layer wrapper for getWatchlistList's `company_watchlistM.aggregate(...)` call. */
export async function runWatchlistListAggregation(pipeline: unknown[]): Promise<WatchlistAggregateFacetResult[]> {
  const company_watchlistM = require('../../../models/app/watchlist/companyM')
  return company_watchlistM.aggregate(pipeline)
}

/** Repository-layer wrapper for watchlistIds's `company_watchlistM.find({...}, {company_row_id:1})`. */
export async function findWatchlistCompanyRowIds(userRowId: number): Promise<Array<{ company_row_id: number }>> {
  const company_watchlistM = require('../../../models/app/watchlist/companyM')
  return company_watchlistM.find({ user_row_id: userRowId }, { company_row_id: 1 })
}
