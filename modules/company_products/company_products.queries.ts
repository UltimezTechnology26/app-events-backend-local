// modules/company_products/company_products.queries.ts
import { buildPaginatedFacetStages, extractPaginatedResult } from '../common/common.pagination'
import { buildProfessionalEnrichmentStages } from '../common/common.enrichment'

interface RawProductDoc {
  _id: number
  register_type: number
  company_row_id: number
  product_type: number
  product_row_id: number
  purchased_date?: any
  purchased_value?: any
  purchased_value_in_usd?: any
  date_n_time?: any
  regulatory_bodies_ids?: any
  regulatory_types_ids?: any
  country_id?: any
  country_details?: any
}

function groupProductIds(products: RawProductDoc[]) {
  const ids = {
    token: [] as number[], token_manual: [] as number[],
    chain: [] as number[], chain_manual: [] as number[],
    exchange: [] as number[], exchange_manual: [] as number[]
  }
  for (const p of products) {
    if (p.product_type === 1 && p.register_type === 1) ids.token.push(p.product_row_id)
    if (p.product_type === 1 && p.register_type === 2) ids.token_manual.push(p.product_row_id)
    if (p.product_type === 2 && p.register_type === 1) ids.chain.push(p.product_row_id)
    if (p.product_type === 2 && p.register_type === 2) ids.chain_manual.push(p.product_row_id)
    if (p.product_type === 3 && p.register_type === 1) ids.exchange.push(p.product_row_id)
    if (p.product_type === 3 && p.register_type === 2) ids.exchange_manual.push(p.product_row_id)
  }
  return ids
}

const norm = (v: any) => v?.toString()

/**
 * Ports the "fetch product display data from marketDB (DB2) and merge onto each product doc"
 * block duplicated 3 times across index.js (`/company_details`, `/company_product_details`) and
 * company_products.js (`/list`) — same 6 collections, same projections, same merge logic in all
 * three. Deduplicated here rather than copied a 4th time.
 */
async function enrichProducts(products: RawProductDoc[]) {
  const { marketDB } = require('../../config/database_connector')
  const ids = groupProductIds(products)

  const [tokens, tokenManual, chains, chainManual, exchanges, exchangeManual] = await Promise.all([
    marketDB.collection('cln_markets_tokens').find({ _id: { $in: ids.token } }, { projection: { _id: 1, token_id: 1, symbol: 1, token_name: 1, token_image: 1, price: 1, percent_change_24h: 1, marketcap: 1, approval_status: 1, volume: 1 } }).toArray(),
    marketDB.collection('cln_markets_search_contract_addresses').find({ _id: { $in: ids.token_manual } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1 } }).toArray(),
    marketDB.collection('cln_chains').find({ _id: { $in: ids.chain } }, { projection: { _id: 1, chain_name: 1, chain_image: 1, chain_slug: 1, chain_id: 1, tvl: 1, protocols: 1, mcap: 1, status: 1 } }).toArray(),
    marketDB.collection('cln_chains_manuals').find({ _id: { $in: ids.chain_manual } }, { projection: { _id: 1, chain_name: 1, chain_symbol: 1, chain_id: 1, chain_link: 1 } }).toArray(),
    marketDB.collection('cln_exchanges').find({ _id: { $in: ids.exchange } }, { projection: { _id: 1, exchange_name: 1, exchange_image: 1, exchange_slug: 1, launch_date: 1, volume_24h: 1, total_pairs: 1, total_coins: 1, status: 1 } }).toArray(),
    marketDB.collection('cln_exchanges_manuals').find({ _id: { $in: ids.exchange_manual } }, { projection: { _id: 1, exchange_name: 1, exchange_image: 1, launch_date: 1, volume_24h: 1, total_pairs: 1, total_coins: 1 } }).toArray()
  ])

  const toMap = (arr: any[]) => Object.fromEntries(arr.map((i) => [norm(i._id), i]))
  const maps = {
    token: toMap(tokens), token_manual: toMap(tokenManual),
    chain: toMap(chains), chain_manual: toMap(chainManual),
    exchange: toMap(exchanges), exchange_manual: toMap(exchangeManual)
  }

  return products.map((p) => {
    const id = norm(p.product_row_id)
    let product_data: any = null
    if (p.register_type === 1 && p.product_type === 1) product_data = maps.token[id] || null
    else if (p.register_type === 2 && p.product_type === 1) product_data = maps.token_manual[id] || null
    else if (p.register_type === 1 && p.product_type === 2) product_data = maps.chain[id] || null
    else if (p.register_type === 2 && p.product_type === 2) product_data = maps.chain_manual[id] || null
    else if (p.register_type === 1 && p.product_type === 3) product_data = maps.exchange[id] || null
    else if (p.register_type === 2 && p.product_type === 3) product_data = maps.exchange_manual[id] || null

    return {
      _id: p._id,
      register_type: p.register_type,
      company_row_id: p.company_row_id,
      product_type: p.product_type,
      product_row_id: p.product_row_id,
      purchased_date: p.purchased_date,
      purchased_value: p.purchased_value,
      purchased_value_in_usd: p.purchased_value_in_usd,
      date_n_time: p.date_n_time,
      product_data
    }
  })
}

export interface GetCompanyProductsListParams {
  company_row_id: number
  skip: number
  limit: number
  search?: string
}

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's GET
 * /list/:company_row_id/:skip/:limit (lines 282-488) — the authenticated, cached
 * "manage my products" list.
 *
 * CONFIRMED BUG, PRESERVED NOT FIXED (flagged, out of this step's scope — the plan's
 * confirmed fix here is specifically the cache key, not this): the real source builds a
 * `search_query` from `req.query.search` (matching a `faq_question` field — copy-pasted from
 * the FAQ module, products have no such field) but never splices it into the aggregation
 * pipeline at all. `search` has always been a complete no-op here; preserved exactly as a
 * silently-accepted, silently-ignored parameter, not wired up as a real fix in this pass.
 *
 * CONFIRMED FIX (Part 1 §3 finding 5): pagination switched from "fetch every matching
 * document unbounded, then `.slice(skip, skip+limit)` in JS" to common.pagination.ts's
 * `$facet`, matching every other migrated list in this build. The cache-key fix for the
 * (currently inert) search term lives in company_products.cache.ts's buildProductListKey,
 * at the controller layer.
 */
export async function getCompanyProductsList(params: GetCompanyProductsListParams): Promise<{ list: any[]; count: number }> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const { company_row_id, skip, limit } = params

  const facetResult = await company_productsM.aggregate([
    { $match: { company_row_id, company_type: 1 } },
    { $sort: { _id: -1 } },
    ...buildPaginatedFacetStages({ skip, limit })
  ])
  const { data, count } = extractPaginatedResult(facetResult)
  const enriched = await enrichProducts(data)

  // Real source's extra fields (not present on the public variant below) — merged back in by
  // array position, since enrichProducts() preserves the input order 1:1.
  const finalList = enriched
    .map((p: any, i: number) => ({
      ...p,
      regulatory_bodies_ids: data[i].regulatory_bodies_ids,
      regulatory_types_ids: data[i].regulatory_types_ids,
      country_id: data[i].country_id,
      country_details: data[i].country_details
    }))
    // Preserve the real source's behavior of dropping rows whose DB2 lookup came back empty
    // (register_type/product_type combo pointing at a product that no longer resolves).
    .filter((p: any) => p.product_data)

  return { list: finalList, count }
}

/**
 * Ports controllers/app/company/products_n_holding/index.js's GET
 * /company_product_details/:company_row_id/:skip/:limit (lines 294-532) — the public,
 * unauthenticated, uncached products display surface (distinct response shape from
 * getCompanyProductsList above: no regulatory_bodies_ids/regulatory_types_ids/country_id/
 * country_details fields — real, confirmed difference, not unified here).
 */
export async function getCompanyProductsListPublic(params: { company_row_id: number; skip: number; limit: number }): Promise<{ list: any[]; count: number }> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const { company_row_id, skip, limit } = params

  const products = await company_productsM.aggregate([
    { $match: { company_row_id, company_type: 1 } },
    { $sort: { _id: -1 } }
  ]).skip(skip).limit(limit)

  // Real source (index.js's /company_product_details) does NOT filter out unresolved rows —
  // unlike getCompanyProductsList above, every row is returned even with product_data null.
  const list = await enrichProducts(products)
  const count = await company_productsM.countDocuments({ company_row_id, company_type: 1 })

  return { list, count }
}

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's GET
 * /get_exchange_country_details/:product_row_id/:skip/:limit (lines 490-638).
 */
export async function getExchangeCountryDetails(params: { product_row_id: number; skip: number; limit: number }): Promise<{ list: any[]; count: number }> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const { marketDB } = require('../../config/database_connector')
  const { product_row_id, skip, limit } = params

  const products = await company_productsM.find({ product_row_id }).sort({ _id: -1 })

  const ids = { exchange: [] as number[], exchange_manual: [] as number[] }
  for (const p of products) {
    if (p.product_type === 3 && p.register_type === 1) ids.exchange.push(p.product_row_id)
    if (p.product_type === 3 && p.register_type === 2) ids.exchange_manual.push(p.product_row_id)
  }

  const [exchanges, exchangeManual] = await Promise.all([
    marketDB.collection('cln_exchanges').find({ _id: { $in: ids.exchange } }, { projection: { _id: 1, exchange_name: 1, exchange_image: 1 } }).toArray(),
    marketDB.collection('cln_exchanges_manuals').find({ _id: { $in: ids.exchange_manual } }, { projection: { _id: 1, exchange_name: 1, exchange_image: 1 } }).toArray()
  ])

  const exchangeMap = Object.fromEntries(exchanges.map((i: any) => [norm(i._id), i]))
  const exchangeManualMap = Object.fromEntries(exchangeManual.map((i: any) => [norm(i._id), i]))

  const countryIds: any[] = []
  for (const p of products) {
    if (Array.isArray(p.country_details)) {
      for (const c of p.country_details) {
        if (c?.country_id) countryIds.push(c.country_id)
      }
    }
  }
  const countries = await marketDB.collection('cln_exchanges_static_countries').find({ country_id: { $in: countryIds } }).toArray()
  const countryMap = Object.fromEntries(countries.map((c: any) => [c.country_id, c]))

  const final = products.map((p: any) => {
    const id = norm(p.product_row_id)
    const exchange = p.register_type === 1 ? exchangeMap[id] : exchangeManualMap[id]
    if (!exchange) return null
    const country_details = (p.country_details || []).map((c: any) => ({ ...c, ...(countryMap[c.country_id] || {}) }))
    return {
      _id: p._id,
      company_row_id: p.company_row_id,
      product_row_id: p.product_row_id,
      exchange_name: exchange.exchange_name,
      exchange_image: exchange.exchange_image,
      country_details
    }
  }).filter(Boolean)

  const count = final.length
  const list = final.slice(skip, skip + limit)
  return { list, count }
}

export interface ProductsCompareEntry {
  tokens: any[]
  chains: any[]
  exchanges: any[]
}

/**
 * Ports the products-side aggregation/shaping of index.js's GET /compare_company_products
 * (lines 300-486, Phase E.1 split) — per-company top-5-by-marketcap/tvl/volume tokens/chains/
 * exchanges for the "compare companies" frontend feature (compareProductHoldingListEPS).
 *
 * CONFIRMED, PRESERVED DIFFERENCE from enrichProducts() above (not unified — this is the real
 * source's own distinct logic for this one route): chains/exchanges are NOT split by
 * register_type here, so manually-registered chains/exchanges are silently excluded from
 * compare view, and each DB2 projection fetched is a narrower subset of fields. Flagged, not
 * fixed — out of this step's scope.
 */
export async function getProductsForCompare(companyRowIds: number[]): Promise<Record<number, ProductsCompareEntry>> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const { marketDB } = require('../../config/database_connector')

  const products = await company_productsM.aggregate([
    { $match: { company_row_id: { $in: companyRowIds }, company_type: 1 } },
    { $sort: { _id: -1 } }
  ])

  const ids = { token: [] as number[], token_manual: [] as number[], chain: [] as number[], exchange: [] as number[] }
  for (const p of products) {
    if (p.product_type === 1 && p.register_type === 1) ids.token.push(p.product_row_id)
    if (p.product_type === 1 && p.register_type === 2) ids.token_manual.push(p.product_row_id)
    if (p.product_type === 2) ids.chain.push(p.product_row_id)
    if (p.product_type === 3) ids.exchange.push(p.product_row_id)
  }

  const [tokens, tokenManual, chains, exchanges] = await Promise.all([
    marketDB.collection('cln_markets_tokens').find({ _id: { $in: ids.token } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1, price: 1, percent_change_24h: 1, marketcap: 1, volume: 1, approval_status: 1 } }).toArray(),
    marketDB.collection('cln_markets_search_contract_addresses').find({ _id: { $in: ids.token_manual } }, { projection: { _id: 1, symbol: 1, token_name: 1, token_image: 1 } }).toArray(),
    marketDB.collection('cln_chains').find({ _id: { $in: ids.chain } }, { projection: { _id: 1, chain_name: 1, chain_image: 1, tvl: 1, mcap: 1 } }).toArray(),
    marketDB.collection('cln_exchanges').find({ _id: { $in: ids.exchange } }, { projection: { _id: 1, exchange_name: 1, exchange_image: 1, volume_24h: 1 } }).toArray()
  ])

  const tokenMap = Object.fromEntries(tokens.map((i: any) => [norm(i._id), i]))
  const tokenManualMap = Object.fromEntries(tokenManual.map((i: any) => [norm(i._id), i]))
  const chainMap = Object.fromEntries(chains.map((i: any) => [norm(i._id), i]))
  const exchangeMap = Object.fromEntries(exchanges.map((i: any) => [norm(i._id), i]))

  const byCompany: Record<number, ProductsCompareEntry> = {}
  for (const id of companyRowIds) byCompany[id] = { tokens: [], chains: [], exchanges: [] }

  for (const p of products) {
    const id = norm(p.product_row_id)
    let data: any = null
    if (p.product_type === 1) data = p.register_type === 1 ? tokenMap[id] : tokenManualMap[id]
    if (p.product_type === 2) data = chainMap[id]
    if (p.product_type === 3) data = exchangeMap[id]
    if (!data || !byCompany[p.company_row_id]) continue
    if (p.product_type === 1) byCompany[p.company_row_id].tokens.push(data)
    if (p.product_type === 2) byCompany[p.company_row_id].chains.push(data)
    if (p.product_type === 3) byCompany[p.company_row_id].exchanges.push(data)
  }

  for (const entry of Object.values(byCompany)) {
    entry.tokens = entry.tokens.sort((a, b) => (b.marketcap || 0) - (a.marketcap || 0)).slice(0, 5)
    entry.chains = entry.chains.sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, 5)
    entry.exchanges = entry.exchanges.sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0)).slice(0, 5)
  }

  return byCompany
}

/**
 * Ports controllers/app/company/products_n_holding/company_products.js's GET
 * /own_companies_list/:product_type/:product_row_id (lines 801-906) — "which companies own
 * this product" (e.g. shown on a token/chain/exchange page).
 */
export async function getOwnCompaniesList(params: { product_type: number; product_row_id: number }): Promise<any[]> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const { getCompanyList, getManualCompanyList, separateManualRegisterCompany } = require('../../utils/helpers/app_helper')
  const { product_type, product_row_id } = params

  const get_query = await company_productsM.aggregate([
    { $sort: { _id: -1 } },
    { $match: { product_row_id, product_type } },
    { $project: { _id: 1, company_row_id: 1, company_type: 1, date_n_time: 1 } }
  ])

  const { manual_array, register_array } = await separateManualRegisterCompany(get_query, 'company_row_id')
  const company_list = await getCompanyList(register_array)
  const manual_list = await getManualCompanyList(manual_array)

  const result: any[] = []
  for (const run of get_query) {
    let company_data: any = ''
    if (run.company_type === 1) {
      company_data = company_list.filter((el: any) => el._id == run.company_row_id)
    } else if (run.company_type === 2) {
      company_data = manual_list.filter((el: any) => el._id == run.company_row_id)
    }
    const company_details = company_data[0] ? company_data[0] : ''
    if (company_details) {
      result.push({
        _id: run._id,
        company_row_id: run.company_row_id,
        company_type: run.company_type,
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

export interface CompanyProductsReportListParams {
  query: any
  skip: number
  limit: number
  user_row_id: number
  boundingBox?: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null
}

/**
 * Ports services/company/front_page.ts's companyList() report_list_type===6 branch
 * (Part 3 §7 Phase E step 5) — the "Products" tab on the companies browse/list page
 * (site-wide, sorted by product count — distinct from getCompanyProductsList() above,
 * which is the per-company "manage my products" list).
 *
 * CONFIRMED ARCHITECTURAL FIX, same blanket decision as company_revenue's
 * getCompanyRevenueReportList (Phase D step 2): the real source already ran list and
 * count off one shared basePipeline (no live bug on the company side), converted here to
 * a single aggregate ending in common.pagination.ts's buildPaginatedFacetStages for
 * consistency with every other migrated report-list branch.
 */
export async function getCompanyProductsReportList(params: CompanyProductsReportListParams): Promise<{ list: any[]; count: number }> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const { getCompanyProducts, getMatchedProducts } = require('../../utils/helpers/app_helper')
  const { query, skip, limit, user_row_id, boundingBox } = params

  const facetResult = await company_productsM.aggregate([
    { $match: { company_type: 1 } },
    {
      $group: {
        _id: '$company_row_id',
        total_products: { $sum: 1 },
        product_ids: { $addToSet: { register_type: '$register_type', product_type: '$product_type', product_row_id: '$product_row_id' } }
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
          { $project: { company_name: 1, company_id: 1, company_logo: 1, company_location: 1, company_valuation: 1, business_model_id: 1, describe_in_one_line: 1, main_business_model_id: 1, country_id: 1, latitude: 1, longitude: 1 } }
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
    { $sort: { total_products: -1 } },
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
    // Ordering already fixed by the $sort at line 398, above — untouched by $set/$match.
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
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
          { $lookup: { from: 'cln_company_followers', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id } }], as: 'info_user_following' } },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_watchlists', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id } }], as: 'info_company_watchlist' } },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1, company_name: 1, latitude: 1, longitude: 1, lat_num: 1, lon_num: 1, company_id: 1, total_products: 1, product_ids: 1,
              company_location: 1, business_model_id: 1, main_business_model_id: 1, country_id: 1,
              company_logo: '$company_info.company_logo', describe_in_one_line: '$company_info.describe_in_one_line',
              country_flag: '$country_info.country_flag', country_name: '$country_info.country_name', business_name: '$business_info.business_name',
              company_valuation: 1, main_business_model_name: '$main_business_info.business_name',
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

  const products_list = await getCompanyProducts(data)
  const list: any[] = []
  for (const item of data) {
    if (item.product_ids) {
      item.products = await getMatchedProducts(item.product_ids, products_list)
    }
    list.push(item)
  }

  return { list, count }
}

export interface PartnerProductsReportListParams {
  searchArray: any[]
  skip: number
  limit: number
  user_row_id: number
}

/**
 * Ports services/company/front_page.ts's partnersList() report_list_type===6 branch
 * (Part 3 §7 Phase E step 5) — the partner-side equivalent of getCompanyProductsReportList
 * above.
 *
 * CONFIRMED BUG FIX (Part 3 §7 Phase E step 5, found while auditing this branch for the
 * migration): the real source's list pipeline never applied `company_type: 1` at all (only
 * the separately-hand-duplicated count pipeline did), so the list and count could disagree
 * whenever manually-added (company_type: 2) companies had products. Fixed the same way as
 * every other report-list branch in this build — one aggregate ending in
 * common.pagination.ts's buildPaginatedFacetStages, so list and count can no longer drift.
 *
 * PRESERVED, CONFIRMED BUG (not fixed, out of this step's scope): the real source's $project
 * sets `latitude: "$company.latitude"` / `longitude: "$company.longitude"` — `company` isn't a
 * field on this pipeline's documents (should be `company_info`), so these have always
 * evaluated to missing/undefined in the response. Kept exactly as-is.
 *
 * No boundingBox support here (real, confirmed — the partner-side function signature never
 * had it, unlike the company-side one, matching every other partner-side report list in this
 * build); not something this port adds.
 */
export async function getPartnerProductsReportList(params: PartnerProductsReportListParams): Promise<{ list: any[]; count: number }> {
  const company_productsM = require('../../models/markets/products_n_holding/company_productsM')
  const { getCompanyProducts, getMatchedProducts } = require('../../utils/helpers/app_helper')
  const { searchArray, skip, limit, user_row_id } = params

  const facetResult = await company_productsM.aggregate([
    { $match: { company_type: 1 } },
    {
      $group: {
        _id: '$company_row_id',
        total_products: { $sum: 1 },
        product_ids: { $addToSet: { register_type: '$register_type', product_type: '$product_type', product_row_id: '$product_row_id' } }
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
          { $project: { company_name: 1, company_id: 1, company_logo: 1, company_location: 1, company_valuation: 1, business_model_id: 1, describe_in_one_line: 1, main_business_model_id: 1, country_id: 1, latitude: 1, longitude: 1 } }
        ]
      }
    },
    { $unwind: { path: '$company_info' } },
    { $sort: { total_products: -1 } },
    {
      $set: {
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_location: '$company_info.company_location',
        business_model_id: '$company_info.business_model_id',
        main_business_model_id: '$company_info.main_business_model_id',
        country_id: '$company_info.country_id',
        company_valuation: '$company_info.company_valuation'
      }
    },
    { $match: { $and: searchArray } },
    // CONFIRMED PERF FIX (live testing, 2026-08-11): same bug shape as getCompanyProductsReportList
    // above — the 6 display-only lookups used to run on every matching company before $skip/$limit.
    // Moved inside the $facet's `data` branch; company_info stays ahead of pagination since it feeds
    // the $set fields the searchArray $match above depends on. Ordering already fixed by the $sort
    // at line 530, above — untouched by $set/$match.
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
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
          { $lookup: { from: 'cln_company_followers', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id } }], as: 'info_user_following' } },
          { $unwind: { path: '$info_user_following', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_watchlists', localField: '_id', foreignField: 'company_row_id', pipeline: [{ $match: { user_row_id } }], as: 'info_company_watchlist' } },
          { $unwind: { path: '$info_company_watchlist', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1, company_row_id: '$_id', company_name: 1, company_id: 1, total_products: 1, product_ids: 1,
              company_location: 1, main_business_model_id: 1, country_id: 1,
              company_logo: '$company_info.company_logo', describe_in_one_line: '$company_info.describe_in_one_line',
              country_flag: '$country_info.country_flag', country_name: '$country_info.country_name',
              latitude: '$company.latitude', longitude: '$company.longitude',
              company_valuation: 1, business_name: '$business_info.business_name', main_business_model_name: '$main_business_info.business_name',
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

  const products_list = await getCompanyProducts(data)
  const list: any[] = []
  for (const item of data) {
    if (item.product_ids) {
      item.products = await getMatchedProducts(item.product_ids, products_list)
    }
    list.push(item)
  }

  return { list, count }
}
