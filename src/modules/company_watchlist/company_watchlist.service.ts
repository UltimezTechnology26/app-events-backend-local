// modules/company_watchlist/company_watchlist.service.ts
const { getPresentDateTime, array_column } = require('../../../utils/helpers/helper')
import { getIntValues } from '@ultimez-interview/coinpedia-backend-library/validation'
const { getCollectionID } = require('../../../utils/helpers/database_helper')
const { checkUserLoginToken } = require('../../../middleware/authorization')
import type { IncomingHttpHeaders } from 'http'
import {
  buildWatchlistSearchConditions,
  buildWatchlistListPipeline,
  extractWatchlistPaginatedResult,
  findApprovedActiveCompanyById,
  upsertWatchlistEntry,
  deleteWatchlistEntry,
  runWatchlistListAggregation,
  findWatchlistCompanyRowIds,
} from './company_watchlist.queries'
import { invalidateWatchlistCaches, buildWatchlistListKey, getCache, setCache } from './company_watchlist.cache'

/**
 * checkUserLoginToken's return shape (middleware/authorization.js): on success `message` is the
 * decoded user's row id (a number); on failure it's a human-readable error string. Modeled as a
 * discriminated union on `status` so a `!actor.status` guard narrows `message` to `number` for
 * the rest of each function.
 */
type Actor = { status: true; message: number } | { status: false; message: string }

export interface AddToWatchlistParams {
  actor: Actor
  companyRowIdRaw: string
}

/**
 * Ports company.js (watchlist)'s GET /add_to_watchlist/:company_row_id (lines 12-103).
 *
 * CONFIRMED BUG FIX: the real source's comment claimed "prevent duplicate insert using single
 * atomic operation," but the code was a plain findOne-then-create — two separate round trips,
 * genuinely race-prone (two simultaneous requests could both pass the findOne check before
 * either insert lands). Replaced with a single atomic `findOneAndUpdate(..., {upsert:true})`:
 * MongoDB performs the "does it exist / insert if not" check as one atomic server-side operation,
 * and `lastErrorObject.updatedExisting` reliably reports which case happened — no unique index
 * migration needed on the existing collection.
 */
export async function addToWatchlist({ actor, companyRowIdRaw }: AddToWatchlistParams) {
  if (!actor.status) {
    return actor
  }

  const user_row_id = actor.message
  const company_row_id = Number.parseInt(companyRowIdRaw, 10)

  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }
  }

  const checkCompany = await findApprovedActiveCompanyById(company_row_id)
  if (!checkCompany) {
    return { status: false, message: { alert_message: 'Sorry, Invalid company row id.' } }
  }

  const nextId = await getCollectionID('cln_company_watchlists')
  const upsertResult = await upsertWatchlistEntry({ companyRowId: company_row_id, userRowId: user_row_id, nextId, dateNTime: getPresentDateTime() })

  const alreadyExisted = Boolean(upsertResult?.lastErrorObject?.updatedExisting)
  if (alreadyExisted) {
    return { status: false, message: { alert_message: 'Sorry, This company is already added to your watchlist.' } }
  }

  await invalidateWatchlistCaches()

  return { status: true, user_row_id, message: { alert_message: 'This company is added to your watchlist successfully!' } }
}

export interface RemoveFromWatchlistParams {
  actor: Actor
  companyRowIdRaw: string
}

/**
 * Ports company.js (watchlist)'s GET /remove_from_watchlist/:company_row_id (lines 104-172).
 *
 * CONFIRMED BUG FIX: the real source called `deleteCompanyWatchlist({type:1,...})` right after
 * `findOneAndDelete` had already removed the exact same row — a guaranteed no-op (confirmed by
 * reading deleteCompanyWatchlist's body: type 1 is `deleteOne` on the same {company_row_id,
 * user_row_id} filter, which finds nothing once findOneAndDelete already removed it). Dropped.
 */
export async function removeFromWatchlist({ actor, companyRowIdRaw }: RemoveFromWatchlistParams) {
  if (!actor.status) {
    return actor
  }

  const user_row_id = actor.message
  const company_row_id = Number.parseInt(companyRowIdRaw, 10)

  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }
  }

  const deleted = await deleteWatchlistEntry({ companyRowId: company_row_id, userRowId: user_row_id })
  if (!deleted) {
    return { status: false, message: { alert_message: 'This company is not in your watchlist.' } }
  }

  await invalidateWatchlistCaches()

  return { status: true, message: { alert_message: 'This company is removed from your watchlist successfully!' } }
}

export interface GetWatchlistListParams {
  actor: Actor
  skipRaw: string
  limitRaw: string
  search?: string
  businessModelIdRaw?: string | string[]
  location?: string
}

/** Ports company.js (watchlist)'s GET /list/:skip/:limit (lines 174-512), $facet-converted per the standing list+count fix. */
export async function getWatchlistList({ actor, skipRaw, limitRaw, search, businessModelIdRaw, location }: GetWatchlistListParams) {
  if (!actor.status) {
    return actor
  }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  const user_row_id = actor.message

  const businessModelIds = businessModelIdRaw ? await getIntValues(businessModelIdRaw) : undefined
  const searchArray = buildWatchlistSearchConditions({ search, businessModelIds, location })

  const cacheKey = buildWatchlistListKey({
    userRowId: user_row_id,
    skip,
    limit,
    search,
    businessModelIdRaw: Array.isArray(businessModelIdRaw) ? businessModelIdRaw.join(',') : businessModelIdRaw,
    location,
  })

  const cache_response = await getCache<{ data: unknown[]; count: number }>({ key: cacheKey })
  if (cache_response.status && cache_response.message) {
    return { status: true, message: cache_response.message.data, count: cache_response.message.count, cache_response_status: true }
  }

  const aggregateOutput = await runWatchlistListAggregation(buildWatchlistListPipeline({ userRowId: user_row_id, searchArray, skip, limit }))
  const { data, count } = extractWatchlistPaginatedResult(aggregateOutput)

  await setCache({ key: cacheKey, value: { data, count }, ttl: 1800 })

  return { status: true, message: data, count, cache_response_status: false }
}

/**
 * For the logged-in user, the plain list of company_row_ids on their
 * watchlist (distinct from getWatchlistList above, which returns full
 * enriched company records). No confirmed frontend caller in either repo
 * audited during this engagement — kept live in its natural home rather than
 * a separate "dead code" file, per the FINAL PHASE decision: this route's URL
 * may still be depended on by a consumer outside those two repos.
 */
export const watchlistIds = async (headers: IncomingHttpHeaders) => {
  const checkUserToken = checkUserLoginToken(headers)
  if (checkUserToken.status) {
    const user_row_id = Number.parseInt(checkUserToken.message)

    let watchlist: number[] = []
    const watchlistQuery = await findWatchlistCompanyRowIds(user_row_id)
    if (watchlistQuery) {
      watchlist = array_column(watchlistQuery, 'company_row_id')
    }

    return { status: true, message: watchlist }
  }
  else {
    return checkUserToken
  }
}
