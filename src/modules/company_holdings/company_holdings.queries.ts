// modules/company_holdings/company_holdings.queries.ts
import { buildPaginatedFacetStages, extractPaginatedResult } from '../common/common.pagination'
import { buildProfessionalEnrichmentStages } from '../common/common.enrichment'
import { createCompanyLookupHelpers, separateManualRegisterCompany } from '@ultimez-interview/coinpedia-backend-library/companies'

const norm = (v: number | string | undefined) => v?.toString()

interface RawHoldingDoc {
  _id: number
  company_row_id: number
  company_type?: number
  token_type: number
  token_row_id: number
  purchased_date?: string
  purchased_value?: string | number
  purchased_value_in_usd?: string | number
  date_n_time?: string
}

interface TokenDbDoc {
  _id: number
  symbol?: string
  token_name?: string
  token_id?: string | number
  token_image?: string
  price?: number
  percent_change_24h?: number
  marketcap?: number
  total_supply?: number
  circulating_supply?: number
  volume?: number
  approval_status?: number
  // Not present in this module's projections, but accessed defensively in joinHoldingTokenData's
  // shaping below (PRESERVED, NOT FIXED — real, pre-existing behavior: always undefined there).
  contract_addresses?: string
}

interface ManualTokenDbDoc {
  _id: number
  symbol?: string
  token_name?: string
  token_image?: string
  contract_address?: string
  // Not present on this collection's real documents — accessed defensively wherever a
  // ManualTokenDbDoc is unioned with a TokenDbDoc/CompareTokenDbDoc (PRESERVED, NOT FIXED).
  price?: number
  percent_change_24h?: number
  marketcap?: number
}

interface CompareTokenDbDoc {
  _id: number
  symbol?: string
  token_name?: string
  token_image?: string
  price?: number
  percent_change_24h?: number
  marketcap?: number
}

interface CompanyListItem {
  _id: number
  approval_status?: number
  company_name?: string
  company_id?: string
  company_email_id?: string
  company_logo?: string
}

interface HoldingListItem {
  _id: number
  company_row_id: number
  token_type: number
  token_row_id: number
  purchased_date?: string
  purchased_value?: string | number
  purchased_value_in_usd?: string | number
  date_n_time?: string
  contract_addresses?: string
  token_name?: string
  symbol?: string
  token_image?: string
}

interface HoldingListPublicItem {
  _id: number
  company_row_id: number
  token_type: number
  token_row_id: number
  purchased_date?: string
  purchased_value?: string | number
  purchased_value_in_usd?: string | number
  date_n_time?: string
  token_id?: string | number
  approval_status?: number
  token_name?: string
  symbol?: string
  token_image?: string
  price?: number | string
  percent_change_24h?: number | string
  marketcap?: number | string
}

interface HoldingsCompareItem extends RawHoldingDoc {
  token_name?: string
  symbol?: string
  token_image?: string
  price?: number | string
  percent_change_24h?: number | string
  marketcap?: number | string
}

interface HoldingsCompanyListItem {
  _id: number
  company_row_id: number
  company_type: number
  purchased_date?: string
  purchased_value?: string | number
  purchased_value_in_usd?: string | number
  date_n_time?: string
  approval_status?: number
  company_name?: string
  company_id?: string
  company_email_id?: string
  company_logo?: string
}

interface CompanyHoldingsReportRow {
  _id: number
  company_name?: string
  company_id?: string
  company_logo?: string
  company_location?: unknown
  describe_in_one_line?: string
  main_business_model_id?: number
  main_business_model_name?: string
  business_name?: string
  country_id?: number
  country_name?: string
  country_flag?: string
  company_valuation?: string | number
  latitude?: string | number
  longitude?: string | number
  lat_num?: number | null
  lon_num?: number | null
  total_holdings?: number
  token_row_ids?: number[]
  watchlist_status?: number
  following_status?: number
  total_followers?: number
  tokens_list?: TokenListItem[]
}

interface TokenListItem {
  _id: number
  symbol?: string
  token_name?: string
  price?: number
  percent_change_24h?: number
  marketcap?: number
  volume?: number
  token_image?: string
  total_supply?: number
}

interface PartnerHoldingsReportRow {
  _id: number
  company_row_id?: number
  company_name?: string
  company_id?: string
  company_location?: unknown
  main_business_model_id?: number
  main_business_model_name?: string
  business_name?: string
  company_valuation?: string | number
  country_id?: number
  country_name?: string
  country_flag?: string
  total_holdings?: number
  token_row_ids?: number[]
  company_logo?: string
  describe_in_one_line?: string
  watchlist_status?: number
  following_status?: number
  total_followers?: number
  tokens_list?: TokenListItem[]
}

/**
 * Ports the "fetch token display data from marketDB (DB2)" block — identical projection/filter
 * in both company_holding.js's `/list` and index.js's `/company_holdings_details` (confirmed by
 * direct comparison; the two routes' real difference is entirely in the FINAL response shape
 * below, not this fetch). Deduplicated here rather than copied a 2nd time.
 */
async function joinHoldingTokenData(holdings: RawHoldingDoc[]) {
  const { marketDB } = require('../../../config/database_connector')
  const tokenIds: number[] = []
  const manualTokenIds: number[] = []
  for (const h of holdings) {
    if (h.token_type === 1) tokenIds.push(h.token_row_id)
    if (h.token_type === 2) manualTokenIds.push(h.token_row_id)
  }

  const [tokens, manualTokens] = await Promise.all([
    tokenIds.length
      ? marketDB.collection('cln_markets_tokens').find(
        { _id: { $in: tokenIds } },
        { projection: { _id: 1, symbol: 1, token_name: 1, token_id: 1, token_image: 1, price: 1, percent_change_24h: 1, marketcap: 1, total_supply: 1, circulating_supply: 1, volume: 1, approval_status: 1 } }
      ).toArray()
      : [],
    manualTokenIds.length
      ? marketDB.collection('cln_markets_search_contract_addresses').find(
        { _id: { $in: manualTokenIds } },
        { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1, contract_address: 1 } }
      ).toArray()
      : []
  ])

  const tokenMap: Record<string, TokenDbDoc> = Object.fromEntries(tokens.map((i: TokenDbDoc) => [norm(i._id), i]))
  const manualMap: Record<string, ManualTokenDbDoc> = Object.fromEntries(manualTokens.map((i: ManualTokenDbDoc) => [norm(i._id), i]))

  return holdings.map((h) => {
    const id = norm(h.token_row_id)
    const token_info: TokenDbDoc | null = h.token_type === 1 ? tokenMap[id as string] : null
    const manual_info: ManualTokenDbDoc | null = h.token_type === 2 ? manualMap[id as string] : null
    return { h, token_info, manual_info, resolved: Boolean(token_info || manual_info) }
  })
}

export interface GetCompanyHoldingsListParams {
  company_row_id: number
  skip: number
  limit: number
}

/**
 * Ports controllers/app/company/products_n_holding/company_holding.js's GET
 * /list/:company_row_id/:skip/:limit (lines 213-388) — the authenticated, cached
 * "manage my holdings" list.
 *
 * CONFIRMED BUG FIX (Part 1 §3, Part 3 §7 Phase E): the real source's count query
 * (`company_holdingM.countDocuments({ company_row_id })`) drops the `company_type: 1` filter
 * the list applies, so a company with holdings under multiple company_type values would see a
 * count that disagrees with what's actually listed. Fixed via common.pagination.ts's $facet —
 * list and count now come from the exact same filtered document set.
 */
export async function getCompanyHoldingsList(params: GetCompanyHoldingsListParams): Promise<{ list: HoldingListItem[]; count: number }> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  const { company_row_id, skip, limit } = params

  const facetResult = await company_holdingM.aggregate([
    { $match: { company_row_id, company_type: 1 } },
    { $sort: { _id: -1 } },
    ...buildPaginatedFacetStages({ skip, limit })
  ])
  const { data, count } = extractPaginatedResult(facetResult)
  const joined = await joinHoldingTokenData(data)

  const list = joined
    .filter((j) => j.resolved)
    .map(({ h, token_info, manual_info }) => ({
      _id: h._id,
      company_row_id: h.company_row_id,
      token_type: h.token_type,
      token_row_id: h.token_row_id,
      purchased_date: h.purchased_date,
      purchased_value: h.purchased_value,
      purchased_value_in_usd: h.purchased_value_in_usd,
      date_n_time: h.date_n_time,
      contract_addresses: token_info?.contract_addresses || manual_info?.contract_address,
      token_name: token_info?.token_name || manual_info?.token_name,
      symbol: token_info?.symbol || manual_info?.symbol,
      token_image: token_info?.token_image || manual_info?.token_image
    }))

  return { list, count }
}

/**
 * Ports controllers/app/company/products_n_holding/index.js's GET
 * /company_holdings_details/:company_row_id/:skip/:limit (lines 535-674) — the public,
 * unauthenticated, uncached holdings display surface.
 *
 * Real, confirmed response-shape difference from getCompanyHoldingsList above (same DB2 fetch,
 * different final projection): this variant includes token_id/approval_status/price/
 * percent_change_24h/marketcap (absent from the other), omits contract_addresses (present on
 * the other), and falls back token_image to `""` instead of `manual_info?.token_image`. Not
 * unified — both preserved exactly as their real sources compute them.
 *
 * Count here already correctly includes `company_type: 1` in the real source — no bug on this
 * variant, plain countDocuments preserved (not switched to $facet, since there's nothing to fix).
 */
export async function getCompanyHoldingsListPublic(params: GetCompanyHoldingsListParams): Promise<{ list: HoldingListPublicItem[]; count: number }> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  const { company_row_id, skip, limit } = params

  const holdings = await company_holdingM.aggregate([
    { $sort: { _id: -1 } },
    { $match: { company_row_id, company_type: 1 } }
  ]).skip(skip).limit(limit)

  const joined = await joinHoldingTokenData(holdings)
  const list = joined
    .filter((j) => j.resolved)
    .map(({ h, token_info, manual_info }) => ({
      _id: h._id,
      company_row_id: h.company_row_id,
      token_type: h.token_type,
      token_row_id: h.token_row_id,
      purchased_date: h.purchased_date,
      purchased_value: h.purchased_value,
      purchased_value_in_usd: h.purchased_value_in_usd,
      date_n_time: h.date_n_time,
      token_id: token_info?.token_id || '',
      approval_status: token_info?.approval_status || 0,
      token_name: token_info?.token_name || manual_info?.token_name,
      symbol: token_info?.symbol || manual_info?.symbol,
      token_image: token_info?.token_image || '',
      price: token_info?.price || '',
      percent_change_24h: token_info?.percent_change_24h || '',
      marketcap: token_info?.marketcap || ''
    }))

  const count = await company_holdingM.countDocuments({ company_row_id, company_type: 1 })

  return { list, count }
}

export interface HoldingsCompareEntry {
  holdings: HoldingsCompareItem[]
}

/**
 * Ports the holdings-side aggregation/shaping of index.js's GET /compare_company_products
 * (lines 300-486, Phase E.1 split) — per-company top-5-by-marketcap holdings for the "compare
 * companies" frontend feature.
 *
 * CONFIRMED, PRESERVED DIFFERENCE from joinHoldingTokenData() above (not unified — this is the
 * real source's own distinct logic for this one route): the token lookup filters
 * `active_status: 1` (joinHoldingTokenData does not) and fetches a narrower projection (no
 * token_id/approval_status/total_supply/circulating_supply/volume/contract_addresses).
 */
export async function getHoldingsForCompare(companyRowIds: number[]): Promise<Record<number, HoldingsCompareEntry>> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  const { marketDB } = require('../../../config/database_connector')

  const holdings = await company_holdingM.aggregate([
    { $match: { company_row_id: { $in: companyRowIds }, company_type: 1 } },
    { $sort: { _id: -1 } }
  ])

  const tokenIds: number[] = []
  const manualTokenIds: number[] = []
  for (const h of holdings) {
    if (h.token_type === 1) tokenIds.push(h.token_row_id)
    if (h.token_type === 2) manualTokenIds.push(h.token_row_id)
  }

  const [tokens, manualTokens] = await Promise.all([
    marketDB.collection('cln_markets_tokens').find({ _id: { $in: tokenIds }, active_status: 1 }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1, price: 1, percent_change_24h: 1, marketcap: 1 } }).toArray(),
    marketDB.collection('cln_markets_search_contract_addresses').find({ _id: { $in: manualTokenIds } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1 } }).toArray()
  ])

  const tokenMap: Record<string, CompareTokenDbDoc> = Object.fromEntries(tokens.map((i: CompareTokenDbDoc) => [norm(i._id), i]))
  const manualMap: Record<string, ManualTokenDbDoc> = Object.fromEntries(manualTokens.map((i: ManualTokenDbDoc) => [norm(i._id), i]))

  const byCompany: Record<number, HoldingsCompareEntry> = {}
  for (const id of companyRowIds) byCompany[id] = { holdings: [] }

  for (const h of holdings) {
    const id = norm(h.token_row_id) ?? ''
    const token_info = h.token_type === 1 ? tokenMap[id] : null
    const manual_info = h.token_type === 2 ? manualMap[id] : null
    const data = token_info || manual_info
    if (!data || !byCompany[h.company_row_id]) continue
    byCompany[h.company_row_id].holdings.push({
      ...h,
      token_name: data.token_name,
      symbol: data.symbol,
      token_image: data.token_image,
      price: data.price || '',
      percent_change_24h: data.percent_change_24h || '',
      marketcap: data.marketcap || ''
    })
  }

  for (const entry of Object.values(byCompany)) {
    entry.holdings = entry.holdings.sort((a, b) => (Number(b.marketcap) || 0) - (Number(a.marketcap) || 0)).slice(0, 5)
  }

  return byCompany
}

/**
 * Ports controllers/app/company/products_n_holding/company_holding.js's GET
 * /companies_list/:token_row_id (lines 518-619) — "which companies hold this token."
 */
interface HoldingsCompaniesListRawRow {
  _id: number
  company_row_id: number
  company_type: number
  purchased_date?: string
  purchased_value?: string | number
  purchased_value_in_usd?: string | number
  date_n_time?: string
}

export async function getHoldingsCompaniesList(tokenRowId: number): Promise<HoldingsCompanyListItem[]> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  const companyM = require('../../../models/app/company/companyM')
  const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
  const { getCompanyList, getManualCompanyList } = createCompanyLookupHelpers(companyM, company_manual_retrievalsM)

  const get_query: HoldingsCompaniesListRawRow[] = await company_holdingM.aggregate([
    { $sort: { _id: -1 } },
    { $match: { token_row_id: tokenRowId, token_type: 1 } },
    { $project: { _id: 1, company_row_id: 1, company_type: 1, purchased_date: 1, purchased_value: 1, purchased_value_in_usd: 1, date_n_time: 1 } }
  ])

  const { manual_array, register_array } = await separateManualRegisterCompany(get_query, 'company_row_id')
  const company_list: CompanyListItem[] = await getCompanyList(register_array as number[])
  const manual_list: CompanyListItem[] = await getManualCompanyList(manual_array as number[])

  const result: HoldingsCompanyListItem[] = []
  for (const run of get_query) {
    let company_data: CompanyListItem[] = []
    if (run.company_type === 1) {
      company_data = company_list.filter((el: CompanyListItem) => el._id == run.company_row_id)
    } else if (run.company_type === 2) {
      company_data = manual_list.filter((el: CompanyListItem) => el._id == run.company_row_id)
    }
    const company_details = company_data[0]
    if (company_details) {
      result.push({
        _id: run._id,
        company_row_id: run.company_row_id,
        company_type: run.company_type,
        purchased_date: run.purchased_date,
        purchased_value: run.purchased_value,
        purchased_value_in_usd: run.purchased_value_in_usd,
        date_n_time: run.date_n_time,
        approval_status: company_details.approval_status,
        company_name: company_details.company_name,
        company_id: company_details.company_id,
        company_email_id: company_details.company_email_id,
        company_logo: company_details.company_logo
      })
    }
  }
  return result
}

export interface CompanyHoldingsReportListParams {
  query: Record<string, unknown>
  skip: number
  limit: number
  user_row_id: number
  boundingBox?: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null
}

/**
 * Ports services/company/front_page.ts's companyList() report_list_type===7 branch
 * (Part 3 §7 Phase E step 5) — the "Holdings" tab on the companies browse/list page
 * (site-wide, sorted by total holdings value — distinct from getCompanyHoldingsList()
 * above, which is the per-company "manage my holdings" list).
 *
 * CONFIRMED ARCHITECTURAL FIX, same blanket decision as company_revenue's
 * getCompanyRevenueReportList (Phase D step 2): the real source already ran list and
 * count off one shared basePipeline (no live bug on the company side), converted here to
 * a single aggregate ending in common.pagination.ts's buildPaginatedFacetStages for
 * consistency with every other migrated report-list branch.
 */
export async function getCompanyHoldingsReportList(params: CompanyHoldingsReportListParams): Promise<{ list: CompanyHoldingsReportRow[]; count: number; token_list: TokenListItem[] }> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  const { getTokenList, filterTokens } = require('../../../utils/helpers/app_helper')
  const { query, skip, limit, user_row_id, boundingBox } = params

  const facetResult = await company_holdingM.aggregate([
    { $match: { company_type: 1 } },
    {
      $group: {
        _id: '$company_row_id',
        total_holdings: { $sum: '$purchased_value_in_usd' },
        token_row_ids: { $addToSet: { $cond: [{ $eq: ['$token_type', 1] }, '$token_row_id', '$$REMOVE'] } },
        count: { $sum: 1 }
      }
    },
    { $sort: { total_holdings: -1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: '_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          ...buildProfessionalEnrichmentStages(),
          { $project: { company_name: 1, company_id: 1, company_logo: 1, company_location: 1, business_model_id: 1, describe_in_one_line: 1, main_business_model_id: 1, company_valuation: 1, country_id: 1, latitude: 1, longitude: 1 } }
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
    ...(boundingBox
      ? [{ $match: { lat_num: { $gte: boundingBox.minLat, $lte: boundingBox.maxLat }, lon_num: { $gte: boundingBox.minLon, $lte: boundingBox.maxLon } } }]
      : []),
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
        longitude: '$company_info.longitude'
      }
    },
    { $match: query },
    // CONFIRMED PERF FIX (live testing, 2026-08-11): same bug shape as company_admin.list.queries.ts's
    // buildCompanyListPipeline — the 6 display-only lookups below used to run on every matching
    // company before $skip/$limit. Moved inside the $facet's `data` branch; company_info above stays
    // ahead of pagination since it feeds the boundingBox filter and the $set fields `query` depends on.
    // Ordering already fixed by the $sort at line 305, above — untouched by $set/$match.
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_company_followers', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id } }], as: 'info_user_following' } },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_watchlists', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id } }], as: 'info_company_watchlist' } },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'main_business_info', pipeline: [{ $project: { business_name: 1 } }] } },
          { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_static_company_business_models', localField: 'business_model_id', foreignField: '_id', as: 'business_info', pipeline: [{ $project: { business_name: 1 } }] } },
          { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'country_info', pipeline: [{ $project: { country_name: 1, country_flag: 1 } }] } },
          { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: '_id',
              foreignField: 'company_row_id',
              as: 'followers_info',
              pipeline: [
                { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'inner_user_info', pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }] } },
                { $unwind: '$inner_user_info' },
                { $count: 'count' }
              ]
            }
          },
          {
            $project: {
              _id: 1, company_name: 1, company_id: 1, latitude: 1, longitude: 1, lat_num: 1, lon_num: 1, company_location: 1, main_business_model_id: 1, country_id: 1, total_holdings: 1, token_row_ids: 1,
              company_logo: '$company_info.company_logo', describe_in_one_line: '$company_info.describe_in_one_line', company_valuation: '$company_info.company_valuation',
              country_flag: '$country_info.country_flag', country_name: '$country_info.country_name',
              business_name: '$business_info.business_name', main_business_model_name: '$main_business_info.business_name',
              watchlist_status: { $cond: [{ $ifNull: ['$info_company_watchlist', false] }, 1, 0] },
              following_status: { $cond: [{ $ifNull: ['$info_user_following', false] }, 1, 0] },
              total_followers: { $cond: [{ $gt: [{ $size: '$followers_info' }, 0] }, '$followers_info.count', 0] }
            }
          }
        ],
        totalCount: [{ $count: 'count' }]
      }
    }
  ])

  const { data, count }: { data: CompanyHoldingsReportRow[]; count: number } = extractPaginatedResult(facetResult)

  const tokenIds: number[] = []
  data.forEach((r: CompanyHoldingsReportRow) => {
    if (Array.isArray(r.token_row_ids)) tokenIds.push(...r.token_row_ids)
  })
  const token_list: TokenListItem[] = await getTokenList({ token_ids: tokenIds })

  const list: CompanyHoldingsReportRow[] = []
  for (const row of data) {
    if (row.token_row_ids) {
      row.tokens_list = await filterTokens({ token_ids: row.token_row_ids, token_list })
    }
    list.push(row)
  }

  return { list, count, token_list }
}

export interface TokenOwnedByUserParams {
  token_row_id: number
  user_row_id: number
}

/**
 * Ports the "confirm this token belongs to this app-user" lookup shared, in the real source,
 * between company_holding.js's GET /companies_list/:token_row_id (line ~ tokensM.findOne guard,
 * moved out of company_holdings.controller.ts) and GET /delete_holding/:holding_row_id (moved
 * out of company_holdings.service.ts's deleteHolding) — identical shape in both call sites.
 */
export async function findTokenOwnedByUser({ token_row_id, user_row_id }: TokenOwnedByUserParams): Promise<{ _id: number } | null> {
  const tokensM = require('../../../models/markets/tokensM')
  return tokensM.findOne({ _id: token_row_id, user_row_id }, { _id: 1 })
}

/** Moved out of company_holdings.service.ts's saveOrUpdateHolding (submitted_from_type===2, company_type===1 branch). */
export async function findActiveCompanyById(company_row_id: number): Promise<{ _id: number } | null> {
  const companyM = require('../../../models/app/company/companyM')
  return companyM.findOne({ _id: company_row_id, active_status: 1 })
}

/** Moved out of company_holdings.service.ts's saveOrUpdateHolding (submitted_from_type===2, company_type!==1 branch). */
export async function findManualCompanyById(company_row_id: number): Promise<{ _id: number } | null> {
  const company_manual_retrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
  return company_manual_retrievalsM.findOne({ _id: company_row_id })
}

/** Moved out of company_holdings.service.ts's saveOrUpdateHolding (token_type===1 branch). */
export async function findTokenById(token_row_id: number): Promise<{ _id: number } | null> {
  const tokensM = require('../../../models/markets/tokensM')
  return tokensM.findOne({ _id: token_row_id })
}

/** Moved out of company_holdings.service.ts's saveOrUpdateHolding (token_type===2 branch). */
export async function findSearchContractAddressById(token_row_id: number): Promise<{ _id: number } | null> {
  const search_contract_addressM = require('../../../models/markets/search_contract_addressM')
  return search_contract_addressM.findOne({ _id: token_row_id })
}

/** Moved out of company_holdings.service.ts's saveOrUpdateHolding (holding_row_id validity check). */
export async function findHoldingByIdAndCompany(holding_row_id: number, company_row_id: number): Promise<RawHoldingDoc | null> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  return company_holdingM.findOne({ _id: holding_row_id, company_row_id })
}

/** Moved out of company_holdings.service.ts's deleteHolding (existence + ownership lookups). */
export async function findHoldingById(holding_row_id: number): Promise<RawHoldingDoc | null> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  return company_holdingM.findOne({ _id: holding_row_id })
}

export interface HoldingUpdateFields {
  company_type: number
  company_row_id: number
  token_row_id: number
  token_type: number
  purchased_date?: string
  purchased_value?: string | number
  purchased_value_in_usd?: string | number
}

/** Moved out of company_holdings.service.ts's saveOrUpdateHolding (update branch). */
export async function updateHoldingById(holding_row_id: number, update_object: HoldingUpdateFields): Promise<void> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  await company_holdingM.updateOne({ _id: holding_row_id }, { $set: update_object })
}

export interface HoldingCreateFields extends HoldingUpdateFields {
  date_n_time: string
}

/** Moved out of company_holdings.service.ts's saveOrUpdateHolding (insert branch). */
export async function createHolding(update_object: HoldingCreateFields): Promise<void> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  await new company_holdingM(update_object).save()
}

/** Moved out of company_holdings.service.ts's deleteHolding. */
export async function deleteHoldingById(holding_row_id: number): Promise<void> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  await company_holdingM.deleteOne({ _id: holding_row_id })
}

export interface PartnerHoldingsReportListParams {
  searchArray: Record<string, unknown>[]
  skip: number
  limit: number
  user_row_id: number
}

/**
 * Ports services/company/front_page.ts's partnersList() report_list_type===7 branch
 * (Part 3 §7 Phase E step 5) — the partner-side equivalent of getCompanyHoldingsReportList
 * above.
 *
 * CONFIRMED BUG FIX (Part 3 §7 Phase E step 5, found while auditing this branch for the
 * migration): the real source's list pipeline never applied `company_type: 1` at all (only
 * the separately-hand-duplicated count pipeline did), so the list and count could disagree
 * whenever manually-added (company_type: 2) companies had holdings. Fixed the same way as
 * every other report-list branch in this build — one aggregate ending in
 * common.pagination.ts's buildPaginatedFacetStages, so list and count can no longer drift.
 *
 * No boundingBox support here (real, confirmed — the partner-side function signature never
 * had it, unlike the company-side one, matching every other partner-side report list in this
 * build); not something this port adds.
 */
export async function getPartnerHoldingsReportList(params: PartnerHoldingsReportListParams): Promise<{ list: PartnerHoldingsReportRow[]; count: number; token_list: TokenListItem[] }> {
  const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
  const { getTokenList, filterTokens } = require('../../../utils/helpers/app_helper')
  const { searchArray, skip, limit, user_row_id } = params

  const facetResult = await company_holdingM.aggregate([
    { $match: { company_type: 1 } },
    {
      $group: {
        _id: '$company_row_id',
        total_holdings: { $sum: '$purchased_value_in_usd' },
        token_row_ids: { $addToSet: { $cond: { if: { $eq: ['$token_type', 1] }, then: '$token_row_id', else: '$$REMOVE' } } },
        count: { $sum: 1 }
      }
    },
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
    { $sort: { total_holdings: -1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: '_id',
        foreignField: '_id',
        as: 'company_info',
        pipeline: [
          { $match: { approval_status: 1, active_status: 1 } },
          ...buildProfessionalEnrichmentStages(),
          { $project: { company_name: 1, company_id: 1, company_logo: 1, company_location: 1, business_model_id: 1, describe_in_one_line: 1, main_business_model_id: 1, company_valuation: 1, country_id: 1 } }
        ]
      }
    },
    { $unwind: { path: '$company_info' } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_location: '$company_info.company_location',
        business_model_id: '$company_info.business_model_id',
        main_business_model_id: '$company_info.main_business_model_id',
        country_id: '$company_info.country_id'
      }
    },
    { $match: { $and: searchArray } },
    // CONFIRMED PERF FIX (live testing, 2026-08-11): same bug shape as getCompanyHoldingsReportList
    // above — the 6 display-only lookups used to run on every matching company before $skip/$limit.
    // Moved inside the $facet's `data` branch; company_info stays ahead of pagination since it feeds
    // the $set fields the searchArray $match above depends on. Ordering already fixed by the $sort
    // at line 446, above — untouched by $set/$match.
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'cln_company_followers', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id } }], as: 'info_user_following' } },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_watchlists', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id } }], as: 'info_company_watchlist' } },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_static_company_business_models', localField: 'main_business_model_id', foreignField: '_id', as: 'main_business_info', pipeline: [{ $project: { business_name: 1 } }] } },
          { $unwind: { path: '$main_business_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_static_company_business_models', localField: 'business_model_id', foreignField: '_id', as: 'business_info', pipeline: [{ $project: { business_name: 1 } }] } },
          { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'country_info', pipeline: [{ $project: { country_name: 1, country_flag: 1 } }] } },
          { $unwind: { path: '$country_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'cln_company_followers',
              localField: '_id',
              foreignField: 'company_row_id',
              as: 'followers_info',
              pipeline: [
                { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'inner_user_info', pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }] } },
                { $unwind: { path: '$inner_user_info' } },
                { $count: 'count' }
              ]
            }
          },
          {
            $project: {
              _id: 1, company_row_id: '$_id', company_name: 1, company_id: 1, company_location: 1, main_business_model_id: 1,
              company_valuation: '$company_info.company_valuation', country_id: 1, total_holdings: 1, token_row_ids: 1,
              company_logo: '$company_info.company_logo', describe_in_one_line: '$company_info.describe_in_one_line',
              country_flag: '$country_info.country_flag', country_name: '$country_info.country_name',
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

  const { data, count }: { data: PartnerHoldingsReportRow[]; count: number } = extractPaginatedResult(facetResult)

  let token_row_ids: number[] = []
  for (const run of data) {
    if (Array.isArray(run.token_row_ids)) token_row_ids = token_row_ids.concat(run.token_row_ids)
  }
  const token_list: TokenListItem[] = await getTokenList({ token_ids: token_row_ids })

  const list: PartnerHoldingsReportRow[] = []
  for (const run of data) {
    if (run.token_row_ids) {
      run.tokens_list = await filterTokens({ token_ids: run.token_row_ids, token_list })
    }
    list.push(run)
  }

  return { list, count, token_list }
}
