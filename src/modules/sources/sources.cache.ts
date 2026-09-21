// modules/sources/sources.cache.ts
import { getCache, setCache } from '@ultimez-interview/coinpedia-backend-library/cache'

// This module has no write path yet (see sources.models.ts's own doc comment - MongoDB is
// populated by the one-time `scripts/migrate-sources-urls.ts` pull, not by any live write route),
// so there is nothing to invalidate this cache on - a longer TTL than the 30-minute convention
// used by write-backed lists elsewhere in this codebase is safe here, and meaningfully reduces
// read cost on a collection this large (10k+ company sources) that every admin page load
// aggregates against.
export const SOURCES_LIST_CACHE_TTL_SECONDS = 900

export { getCache, setCache }

export function buildSourcesListKey(entity: 'company' | 'professional', skip: number, limit: number, params: Record<string, string | undefined>): string {
  const filterKey = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('_')
  return `sources_${entity}_list_${skip}_${limit}_${filterKey}`
}
