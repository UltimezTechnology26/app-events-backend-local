// modules/professionals-followers/professionals-followers.cache.ts
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

const LIST_CACHE_TTL_SECONDS = 1800

export { getCache, setCache }

export function buildFollowersListKey(userRowId: number, search?: string): string {
  return `users_followers_list_${userRowId}_${search || ''}`
}
export function buildFollowingListKey(userRowId: number, search?: string): string {
  return `users_following_list_${userRowId}_${search || ''}`
}
export function buildFollowRequestsPendingListKey(userRowId: number, search?: string): string {
  return `users_following_pending_list_${userRowId}_${search || ''}`
}
export function buildCompanyFollowingListKey(userRowId: number, search?: string): string {
  return `users_company_following_list_${userRowId}_${search || ''}`
}

export { LIST_CACHE_TTL_SECONDS }

/** Every write route in followers.js invalidates this same union of patterns. */
const WRITE_INVALIDATION_PATTERNS = [
  'app_users_list_*',
  'users_following_list_*',
  'users_followers_list_*',
  'users_following_pending_list_*',
  'app_user_other_details_*',
  'app_company_individual_other_details_*',
  'employee_list_*',
  'app_user_detail_*',
  'individual_event_*',
  'speakers_list_*',
] as const

/**
 * Returns the array of per-pattern results (in WRITE_INVALIDATION_PATTERNS order) — `unfollowUser`
 * needs the first one specifically, since legacy's `/unfollow_user` echoes
 * `deleteKeysByPattern('app_users_list_*')`'s own return value back to the client as
 * `delete_cache` (the only route that does this; every other write route discards it).
 */
export async function invalidateFollowersCaches(): Promise<Array<{ status: boolean; message: unknown }>> {
  return Promise.all(WRITE_INVALIDATION_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
