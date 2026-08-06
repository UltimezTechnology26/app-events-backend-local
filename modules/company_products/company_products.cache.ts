// modules/company_products/company_products.cache.ts
const { getCache, setCache, deleteKeysByPattern } = require('../../config/cache_helper')
import { invalidateSharedCompanyCaches } from '../common/common.cache-patterns'

export const COMPANY_PRODUCTS_CACHE_PATTERNS = [
  'company_product_list_*'
] as const

export async function invalidateCompanyProductsCaches(): Promise<void> {
  await Promise.all([
    ...COMPANY_PRODUCTS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    invalidateSharedCompanyCaches()
  ])
}

/**
 * CONFIRMED BUG FIX (Part 1 §3 finding 5, Part 3 §7 Phase E): the real source built this key
 * BEFORE the search-term filter was (supposedly) applied, so two different searches for the
 * same company/page collided on one cache entry. Now includes the search term. Note: the
 * search filter itself is separately confirmed non-functional in the real source (built but
 * never spliced into the aggregation pipeline, and using a copy-pasted `faq_question` field
 * that doesn't exist on product documents) — preserved as-is, not fixed here (out of this
 * bug's stated scope); see company_products.queries.ts's getCompanyProductsList for the flag.
 */
export function buildProductListKey(companyRowId: number, skip: number, limit: number, search?: string): string {
  return `company_product_list_${companyRowId}_${skip}_${limit}_${search || 'none'}`
}

export { getCache, setCache }
