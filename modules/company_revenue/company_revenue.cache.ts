// modules/company_revenue/company_revenue.cache.ts
const { getCache, setCache, deleteKeysByPattern } = require('../../config/cache_helper')
import { invalidateSharedCompanyCaches } from '../common/common.cache-patterns'

/**
 * Ports the 5 literal deleteKeysByPattern() calls repeated identically after every
 * write in revenue.js (update_n_save_details and delete_revenue) — Part 1 §3
 * finding 4. The two "shared across the whole company domain" patterns now live in
 * common.cache-patterns.ts (Part 3 §7 Phase D step 1); the other 3 are specific to
 * this module.
 */
export const COMPANY_REVENUE_CACHE_PATTERNS = [
  'company_revenue_list_*',
  'company_revenue_overview_*',
  'company_investment_funding_*',
  // The /overview endpoint's own cache (services/company/front_page.ts's overview(),
  // valuation_type 1/2 only — Part 3 §7 Phase D, confirmed with the user): revenue writes
  // are the only thing that can change these totals for report_list_type=5, so they're the
  // only write path that needs to clear it. Same Redis server as config/redis.ts's client
  // (both read REDIS_CACHE_URL), so a different client instance here still reaches it.
  'company_overview_*'
] as const

export async function invalidateCompanyRevenueCaches(): Promise<void> {
  await Promise.all([
    ...COMPANY_REVENUE_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    invalidateSharedCompanyCaches()
  ])
}

export function buildRevenueOverviewKey(companyRowId: number, filterYears: number): string {
  return `company_revenue_overview_${companyRowId}_${filterYears}`
}

export function buildRevenueListKey(
  companyRowId: number,
  skip: number,
  limit: number,
  year?: string,
  quarter?: string,
  revenueStream?: string
): string {
  return `company_revenue_list_${companyRowId}_${skip}_${limit}_${year || 'all'}_${quarter || 'all'}_${revenueStream || 'all'}`
}

export { getCache, setCache }
