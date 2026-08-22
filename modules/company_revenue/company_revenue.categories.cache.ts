// modules/company_revenue/company_revenue.categories.cache.ts
const { deleteKeysByPattern } = require('../../config/cache_helper')

/**
 * Ports revenue_streams.js's cache-invalidation pattern ('company_revenue_list_*').
 *
 * NOTE: legacy revenue_streams.js only invalidated this cache on UPDATE, not on
 * CREATE (an apparent oversight — the save_n_edit handler's update branch calls
 * `deleteKeysByPattern('company_revenue_list_*')` at line 212, but its insert
 * branch at line 216-218 does not). This port invalidates on both create and
 * update — an intentional, user-approved fix, not a faithful-to-legacy behavior.
 */
export const REVENUE_STREAM_CATEGORIES_CACHE_PATTERNS = ['company_revenue_list_*'] as const

export async function invalidateRevenueStreamCategoriesCaches(): Promise<void> {
  await Promise.all(REVENUE_STREAM_CATEGORIES_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
