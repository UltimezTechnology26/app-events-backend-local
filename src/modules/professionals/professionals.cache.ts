// modules/professionals/professionals.cache.ts
//
// Read-through cache for the two expensive/frequent reads ported in this Phase A slice
// (the paginated /list, and the two overview dashboards), with pattern-based invalidation on
// every write route that changes professional data — following funding.cache.ts's style
// (parameterized keys + `deleteKeysByPattern` patterns), not company_admin.cache.ts's minimal
// single-key/no-invalidation version, since /list and /overview are read on every admin-panel
// page load and every create/update/enable/disable changes their result.
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

/** Deduped union of every cache key pattern a Phase A write route can invalidate. */
export const PROFESSIONALS_CACHE_PATTERNS = ['professionals_list_*', 'professionals_admin_created_list_*', 'professionals_years_overview', 'professionals_overview'] as const

// Clears the admin list/overview AND the public-facing caches (invalidateProfessionalPublicCaches,
// declared below) - every route that calls this changes professional data the public list/profile
// page also shows (create, update, enable/disable, delete), so clearing only the admin keys left the
// public pages stale until their TTL expired.
export async function invalidateProfessionalsCaches(): Promise<void> {
  await Promise.all([
    ...PROFESSIONALS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    invalidateProfessionalPublicCaches(),
  ])
}

/**
 * The PUBLIC-facing professional caches (the Professionals list, the profile page and its
 * aggregates, popular/trending/search). `PROFESSIONALS_CACHE_PATTERNS` above only covers the ADMIN
 * list/overview, so a write that called invalidateProfessionalsCaches() alone left the public list
 * and profile page serving the pre-write data until their own TTL (30 min - 12 h) expired - e.g. a
 * changed location still showing the old country. Every professional write route should clear
 * these too (invalidateProfessionalPublicCaches below).
 */
export const PROFESSIONALS_PUBLIC_CACHE_PATTERNS = [
  'user_detail*',
  'app_user_detail_*',
  'app_user_other_details_*',
  'app_users_list_*',
  'app_popular_professionals*',
  'app_trending_users_*',
  'app_search_users_*',
] as const

export async function invalidateProfessionalPublicCaches(): Promise<void> {
  await Promise.all(PROFESSIONALS_PUBLIC_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

/**
 * For account-level state changes (recover, delete, account-delete): besides the professional's
 * own public caches, these flip `active_status` on the owner's company and events too, so the
 * public company and event lists/pages must refresh as well. Cache modules are required lazily
 * (same convention as change-request.registry.ts) to avoid import cycles between domains.
 */
export async function invalidateProfessionalAccountStateCaches(): Promise<void> {
  await Promise.all([
    invalidateProfessionalsCaches(),
    require('../company/settings/company.settings.cache').invalidateBasicDetailsCaches(),
    require('../events/events.cache').invalidateEventChangeRequestCaches(),
  ])
}

export function buildProfessionalsListKey(skip: number, limit: number, query: Record<string, unknown>): string {
  return `professionals_list_${skip}_${limit}_${JSON.stringify(query || {})}`
}

export function buildAdminCreatedListKey(skip: number, limit: number, query: Record<string, unknown>): string {
  return `professionals_admin_created_list_${skip}_${limit}_${JSON.stringify(query || {})}`
}

export const PROFESSIONALS_YEARS_OVERVIEW_KEY = 'professionals_years_overview'
export const PROFESSIONALS_OVERVIEW_KEY = 'professionals_overview'

// Overview dashboards change with every create/update/enable/disable but are read on every
// dashboard load — a short TTL bounds staleness without re-running ~20 count queries per hit.
export const PROFESSIONALS_OVERVIEW_TTL_SECONDS = 60
// The list is read far more often (every admin-panel page/filter change) and paginated, so a
// shorter TTL keeps a stale page from lingering after a write, while still absorbing bursts of
// identical requests (re-renders, quick paging back and forth).
export const PROFESSIONALS_LIST_TTL_SECONDS = 30

export { getCache, setCache }
