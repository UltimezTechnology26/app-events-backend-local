// modules/partners/partners.cache.ts
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
import redisCache, { CacheDuration } from '../../../config/redis'

/**
 * getPartnerListDetails' own read/write cache (services/company/front_page.ts:3165-3192) uses a
 * different Redis client wrapper (config/redis.ts, 12-hour TTL) than every other cache in this
 * project (config/cache_helper.js, always-explicit TTL) — both point at the same physical Redis
 * server via the same REDIS_CACHE_URL, so invalidation via deleteKeysByPattern below still works
 * correctly. Preserved exactly rather than switched to cache_helper, since that's a real, intended
 * behavior difference (12-hour TTL specifically for this expensive list) not a bug to fix.
 */
export function buildPartnersListKey({ skip, limit, reportListType, reqQuery, userRowId }: { skip: number; limit: number; reportListType: number; reqQuery: Record<string, any>; userRowId: number }): string {
  return `app_front_page_partners_list_${skip}_${limit}_${reportListType}_${JSON.stringify(reqQuery)}_${userRowId}`
}

export async function getPartnersListCache(key: string) {
  return redisCache.getCache({ key })
}

export async function setPartnersListCache(key: string, value: { list: any[]; count: number; topCountries: any[] }) {
  return redisCache.setCache({ key, value, ttl: CacheDuration.TWELVE_HOURS })
}

/**
 * Shared by submit_request_to_become_partner, requests_to_partners' approve/reject, and
 * company.js's add_to_partners/remove_from_partner — every write path that changes who's a
 * partner busts this same list cache in the real source.
 */
export async function invalidatePartnersListCache(): Promise<void> {
  await deleteKeysByPattern('app_front_page_partners_list_*')
}

/** Shared by company.js's add_to_partners/remove_from_partner alongside the list cache above. */
export async function invalidatePartnerIndividualOtherDetailsCache(): Promise<void> {
  await deleteKeysByPattern('app_company_individual_other_details_*')
}
