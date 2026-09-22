// modules/professionals/professionals.list.service.ts
import { ProfessionalM } from './professionals.models'
const user_designationsM = require('../../../models/app/static/user_designationsM')
const user_looking_forM = require('../../../models/app/static/user_looking_forM')
import {
  buildProfessionalListMatchQuery,
  buildDesignationLookingForMatchConditions,
  buildProfessionalListPipeline,
  extractProfessionalListResult,
  buildAdminCreatedListMatchQuery,
  buildAdminCreatedListPipeline,
  extractAdminCreatedListResult,
} from './professionals.list.queries'
import { buildProfessionalsListKey, buildAdminCreatedListKey, getCache, setCache, PROFESSIONALS_LIST_TTL_SECONDS } from './professionals.cache'
import { GetProfessionalListParams, GetAdminCreatedListParams } from './professionals.types'
import { getViewCounts30d } from '../view-counts-30d/view-counts-30d.service'

/**
 * Merges `view_count_30d` onto each row (user-requested, 2026-09-22) - applied AFTER the list's
 * own cache read/write, never baked into the cached list JSON, so a list-cache HIT still gets
 * whatever the view-count cache currently holds instead of freezing view counts at whatever they
 * were when the list was first cached (the two caches have deliberately different lifetimes/
 * invalidation triggers).
 */
async function withProfessionalViewCounts30d<T extends { user_name?: string }>(rows: T[]): Promise<(T & { view_count_30d: number })[]> {
  const usernames = rows.map((row) => row.user_name).filter((name): name is string => Boolean(name))
  const counts = usernames.length > 0 ? await getViewCounts30d('professional', usernames) : {}
  return rows.map((row) => ({ ...row, view_count_30d: row.user_name ? (counts[row.user_name.toLowerCase()] ?? 0) : 0 }))
}

function parseSkipLimit(skipRaw: string, limitRaw: string, defaultLimit: number) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : defaultLimit
  return { skip, limit }
}

/**
 * Ports user.js's GET /list/:skip/:limit (~line 1062-1499). $facet-converted per
 * professionals.list.queries.ts's comment; the designation_status/looking_for_status
 * in-memory-set-membership optimization already present in the real route is preserved as-is
 * (it was itself a prior perf fix, not something this port needed to touch).
 */
export async function getProfessionalList(params: GetProfessionalListParams) {
  const { skip, limit } = parseSkipLimit(params.skipRaw, params.limitRaw, 100)

  const claimStatus = params.claimStatusRaw !== undefined ? Number.parseInt(params.claimStatusRaw) : undefined
  const loginStatus = params.loginStatusRaw !== undefined ? Number.parseInt(params.loginStatusRaw) : undefined
  const approvalStatus = params.approvalStatusRaw !== undefined ? Number.parseInt(params.approvalStatusRaw) : undefined
  const subAdminRowId = params.subAdminRowIdRaw !== undefined ? Number.parseInt(params.subAdminRowIdRaw) : undefined

  const matchQuery = buildProfessionalListMatchQuery({
    search: params.search,
    claimStatus,
    loginStatus,
    approvalStatus,
    subAdminRowId,
    profileScoreRange: params.profileScoreRange,
  })

  const cacheKey = buildProfessionalsListKey(skip, limit, { matchQuery, designationStatus: params.designationStatusRaw, lookingForStatus: params.lookingForStatusRaw, sortBy: params.sortByRaw })
  const cached = await getCache({ key: cacheKey })
  if (cached.status) {
    const cachedResult = cached.message as { status: boolean; message: { user_name?: string }[]; count: number }
    return { ...cachedResult, message: await withProfessionalViewCounts30d(cachedResult.message) }
  }

  const designationStatus = Number.parseInt(params.designationStatusRaw as string)
  const lookingForStatus = Number.parseInt(params.lookingForStatusRaw as string)
  const needsDesignationIds = designationStatus === 0 || designationStatus === 1
  const needsLookingForIds = lookingForStatus === 0 || lookingForStatus === 1

  const [activeDesignationIds, activeLookingForIds] = await Promise.all([
    needsDesignationIds ? user_designationsM.distinct('_id', { active_status: true }) : null,
    needsLookingForIds ? user_looking_forM.distinct('_id', { active_status: true }) : null,
  ])

  const matchConditions = buildDesignationLookingForMatchConditions({ designationStatus, activeDesignationIds, lookingForStatus, activeLookingForIds })

  // Cast to `any[]`: the pipeline is assembled by a plain builder function (so its stage shapes
  // stay generic/reusable for tests), not as an inline array literal — TS's PipelineStage overload
  // needs literal-typed sort/facet shapes it can only infer from an inline literal, same reason
  // company_admin.list.service.ts's untyped `require()`'d model sidesteps this entirely.
  const aggregateOutput = await ProfessionalM.aggregate(buildProfessionalListPipeline({ matchQuery, matchConditions, skip, limit, sortBy: params.sortByRaw }) as any[])
  const { data, count } = extractProfessionalListResult(aggregateOutput)

  const result = { status: true, message: data, count }
  await setCache({ key: cacheKey, value: result, ttl: PROFESSIONALS_LIST_TTL_SECONDS })
  return { ...result, message: await withProfessionalViewCounts30d(data) }
}

/** Ports user.js's GET /admin_created_list/:skip/:limit (~line 2756-2975). See professionals.list.queries.ts for the confirmed pagination-ordering perf fix. */
export async function getAdminCreatedList(params: GetAdminCreatedListParams) {
  const { skip, limit } = parseSkipLimit(params.skipRaw, params.limitRaw, 100)
  const matchQuery = buildAdminCreatedListMatchQuery({ search: params.search, profileScoreRange: params.profileScoreRange })

  const cacheKey = buildAdminCreatedListKey(skip, limit, { matchQuery })
  const cached = await getCache({ key: cacheKey })
  if (cached.status) {
    return cached.message
  }

  const aggregateOutput = await ProfessionalM.aggregate(buildAdminCreatedListPipeline({ matchQuery, skip, limit }) as any[])
  const { data, count } = extractAdminCreatedListResult(aggregateOutput)

  const result = { status: true, message: data, count }
  await setCache({ key: cacheKey, value: result, ttl: PROFESSIONALS_LIST_TTL_SECONDS })
  return result
}
