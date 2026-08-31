// modules/funding/funding.rounds.cache.ts
//
// Ports funding_rounds.js's cache-invalidation pattern
// ('app_funding_category_list*'), called after every write (save_n_edit) —
// legacy lines 283, 288. There is no delete route in the legacy controller,
// so there is no corresponding invalidation call for a delete.
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

export const FUNDING_ROUNDS_CACHE_PATTERNS = ['app_funding_category_list*'] as const

export async function invalidateFundingRoundsCaches(): Promise<void> {
  await Promise.all(FUNDING_ROUNDS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
