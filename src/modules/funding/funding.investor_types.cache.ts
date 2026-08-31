// modules/funding/funding.investor_types.cache.ts
//
// Ports funding_investor_types.js's cache-invalidation pattern
// ('app_funding_investor_types_*'), called after every write (save_n_edit,
// delete) — legacy lines 317, 324, 353.
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

export const FUNDING_INVESTOR_TYPES_CACHE_PATTERNS = ['app_funding_investor_types_*'] as const

export async function invalidateFundingInvestorTypesCaches(): Promise<void> {
  await Promise.all(FUNDING_INVESTOR_TYPES_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
