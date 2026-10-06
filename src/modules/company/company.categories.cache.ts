// modules/company/company.categories.cache.ts
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

/**
 * Ports company_business_model.js's cache-invalidation pattern
 * ('app_company_business_models*'), called after every write
 * (add_n_update_details, update_categories, enable, disable, delete).
 * Returns the per-pattern `deleteKeysByPattern` results so the `enable`
 * handler can echo the first one back as `delted_key`, matching legacy
 * exactly (see `enableCompanyCategory` in company.categories.service.ts).
 */
// `app_company_business_models*` MUST stay first (its result is echoed back as `delted_key`). The rest
// are the public company list/partners list/profile page, which embed each company's category names
// (they join cln_static_company_business_models) - renaming/disabling/deleting a category never
// cleared them, so companies kept showing the old category until their (up to 12 h) TTL expired.
export const COMPANY_CATEGORIES_CACHE_PATTERNS = [
  'app_company_business_models*',
  'app_company_list_*',
  'app_front_page_partners_list_*',
  'app_company_individual_details_*',
] as const

export async function invalidateCompanyCategoriesCaches(): Promise<unknown[]> {
  return Promise.all(COMPANY_CATEGORIES_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
