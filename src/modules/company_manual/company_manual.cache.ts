// modules/company_manual/company_manual.cache.ts
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

/**
 * Shared by update_manual_detail, edit_manual_detail, revoke_manual_company, and
 * delete_manual_company in the real source — all 4 invalidate this exact one pattern.
 *
 * CONFIRMED CACHE-INVALIDATION FIX (requirements.md Phase G step 3): the real source's
 * rejected_list is a GET/read route that invalidates 'app_company_list_*' on every single call
 * (manual_retrievals.js:152) — a plain list view, not a mutation — while reject_manual_company
 * (the actual state-changing route) invalidates nothing at all. This call is moved from the
 * read route onto the write route below, matching this project's established list+count and
 * cache-invalidation fix precedent (Phase B).
 */
export async function invalidateManualCompanyListCache(): Promise<void> {
  await deleteKeysByPattern('app_company_list_*')
}
