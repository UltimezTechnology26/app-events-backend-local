// modules/company_watchlist/company_watchlist.cache.ts
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

/** Shared by add_to_watchlist and remove_from_watchlist — identical 7-pattern set in the real source (just typed in a different order at each call site). */
const WATCHLIST_MUTATION_CACHE_PATTERNS = [
  'company_watchlist_list*',
  'app_company_list_*',
  'company_list_*',
  'app_company_individual_details_*',
  'app_company_individual_other_details_*',
  'app_front_page_partners_list_*',
  'organizers_list_*',
] as const

export async function invalidateWatchlistCaches(): Promise<void> {
  await Promise.all(WATCHLIST_MUTATION_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

export function buildWatchlistListKey({
  userRowId,
  skip,
  limit,
  search,
  businessModelIdRaw,
  location,
}: {
  userRowId: number
  skip: number
  limit: number
  search?: string
  businessModelIdRaw?: string
  location?: string
}): string {
  return `company_watchlist_list_${userRowId}_${skip}_${limit}_${search || 'all'}_${businessModelIdRaw || 'all'}_${location || 'all'}`
}

export { getCache, setCache }
