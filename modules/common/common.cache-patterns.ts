const { deleteKeysByPattern } = require('../../config/cache_helper')

// The two literal cache-invalidation pattern strings independently re-typed
// across 6+ files today (revenue.js, company_products.js, company_holding.js,
// employee.js, funding.cache.ts, and any new module's own .cache.ts) —
// Part 1 §3 finding 4. Named once here so a typo (like the real
// `cache_reponse_status` one already found elsewhere in this domain) can't
// happen independently in each new module.
// CONFIRMED CACHE-INVALIDATION GAP FIX (found via live testing, Part 3 §7): the partners
// list (services/company/front_page.ts's getPartnerListDetails) caches its whole response —
// across every report_list_type, including the Products/Holdings reports — under
// `app_front_page_partners_list_*`, but no module's write path ever invalidated it (only the
// companies-list equivalent, COMPANY_LIST, was wired into this shared helper). A product/
// holding/revenue add-edit-delete on a partner-flagged company left the partners list's
// Products/Holdings/Revenue Report showing stale data until the cache's own TTL expired.
export const SHARED_COMPANY_CACHE_PATTERNS = {
  INDIVIDUAL_OTHER_DETAILS: 'app_company_individual_other_details_*',
  COMPANY_LIST: 'app_company_list_*',
  PARTNERS_LIST: 'app_front_page_partners_list_*',
} as const

export async function invalidateSharedCompanyCaches() {
  await Promise.all([
    deleteKeysByPattern(SHARED_COMPANY_CACHE_PATTERNS.INDIVIDUAL_OTHER_DETAILS),
    deleteKeysByPattern(SHARED_COMPANY_CACHE_PATTERNS.COMPANY_LIST),
    deleteKeysByPattern(SHARED_COMPANY_CACHE_PATTERNS.PARTNERS_LIST),
  ])
}
