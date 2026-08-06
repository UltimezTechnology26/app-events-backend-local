// modules/company/company.faq.cache.ts
const { getCache, setCache, deleteKeysByPattern } = require('../../../config/cache_helper')

/**
 * Ports faq.js's 3 identical cache-invalidation blocks (update/insert, delete — all 3 call
 * sites invalidate the same set). Deliberately NOT folded into invalidateSharedCompanyCaches()
 * (common.cache-patterns.ts): the real source never invalidates `app_company_list_*` or
 * `app_front_page_partners_list_*` for FAQ changes, and there's no evidence (unlike the
 * Products/Holdings/Revenue report_list_type overlap) that FAQ content appears on those list
 * pages — ported faithfully, not widened.
 */
export async function invalidateFaqCaches(): Promise<void> {
  await Promise.all([
    deleteKeysByPattern('company_faq_list_*'),
    deleteKeysByPattern('app_company_individual_details_*'),
    deleteKeysByPattern('app_company_individual_other_details_*'),
  ])
}

export function buildFaqListKey({ companyRowId, search, skip, limit }: { companyRowId: number; search?: string; skip: number; limit: number }): string {
  return `company_faq_list_${companyRowId}_${search || ''}_${skip}_${limit}`
}

export { getCache, setCache }
