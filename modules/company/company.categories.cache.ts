// modules/company/company.categories.cache.ts
const { deleteKeysByPattern } = require('../../config/cache_helper')

/**
 * Ports company_business_model.js's cache-invalidation pattern
 * ('app_company_business_models*'), called after every write
 * (add_n_update_details, update_categories, enable, disable, delete).
 * Returns the per-pattern `deleteKeysByPattern` results so the `enable`
 * handler can echo the first one back as `delted_key`, matching legacy
 * exactly (see `enableCompanyCategory` in company.categories.service.ts).
 */
export const COMPANY_CATEGORIES_CACHE_PATTERNS = ['app_company_business_models*'] as const

export async function invalidateCompanyCategoriesCaches(): Promise<unknown[]> {
  return Promise.all(COMPANY_CATEGORIES_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
