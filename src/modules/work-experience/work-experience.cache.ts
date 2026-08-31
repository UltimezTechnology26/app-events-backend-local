// modules/work-experience/work-experience.cache.ts
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
const professional_positionsM = require('../../../models/app/static/professional_positionsM')

/** Deduped union of cache patterns for work-experience read/write routes. */
export const WORK_EXPERIENCE_CACHE_PATTERNS = [
  'individual_professional_details_*',
  'professional_detail_list_*',
  'get_user_seo_*'
] as const

export async function invalidateWorkExperienceCaches(): Promise<void> {
  await Promise.all(WORK_EXPERIENCE_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

const STATIC_POSITIONS_LIST_CACHE_KEY = 'static_professional_positions_list'
const STATIC_POSITIONS_LIST_TTL_SECONDS = 86400

/**
 * The full active cln_static_professionals_work_positions list, cached with a long TTL since
 * it's an admin-managed reference list that rarely changes. Shared across work-experience,
 * team-members, and any external caller — do not build a second copy of this cache elsewhere.
 */
export async function getCachedStaticPositionsList(): Promise<{ _id: number; position_name: string }[]> {
  const cached = await getCache<{ _id: number; position_name: string }[]>({ key: STATIC_POSITIONS_LIST_CACHE_KEY })
  if (cached.status) return cached.message
  const list = await professional_positionsM.find({ active_status: true }, { _id: 1, position_name: 1 }).lean()
  await setCache({ key: STATIC_POSITIONS_LIST_CACHE_KEY, value: list, ttl: STATIC_POSITIONS_LIST_TTL_SECONDS })
  return list
}

export async function invalidateStaticPositionsListCache(): Promise<void> {
  await deleteKeysByPattern(STATIC_POSITIONS_LIST_CACHE_KEY)
}

export { getCache, setCache }
