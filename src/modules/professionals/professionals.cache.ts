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

export async function invalidateProfessionalsCaches(): Promise<void> {
  await Promise.all(PROFESSIONALS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
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
