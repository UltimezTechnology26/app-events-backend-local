// modules/funding/funding.investor_types.cache.ts
//
// Ports funding_investor_types.js's cache-invalidation pattern
// ('app_funding_investor_types_*'), called after every write (save_n_edit,
// delete) — legacy lines 317, 324, 353.
const { deleteKeysByPattern } = require('../../config/cache_helper')

export const FUNDING_INVESTOR_TYPES_CACHE_PATTERNS = ['app_funding_investor_types_*'] as const

export async function invalidateFundingInvestorTypesCaches(): Promise<void> {
  await Promise.all(FUNDING_INVESTOR_TYPES_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
