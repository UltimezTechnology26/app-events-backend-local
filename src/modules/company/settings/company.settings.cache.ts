// modules/company/company.settings.cache.ts
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
import { invalidateSharedCompanyCaches } from '../../common/common.cache-patterns'

/**
 * Ports setting.js's per-route deleteKeysByPattern() blocks. The real source repeats these
 * as separately-hand-typed literal calls at 6 different call sites, each a slightly different
 * subset — preserved as separate named groups here rather than merged into one, since the
 * differences are real (e.g. update_social_details only invalidates on its update branch, never
 * on insert; follow/unfollow use a distinct literal 'company_list_*' key not used anywhere else
 * in this file, on top of the shared 'app_company_list_*').
 */

const BASIC_DETAILS_CACHE_PATTERNS = [
  'app_company_individual_details_*',
  'organizers_list_*',
  'individual_event_*',
  'app_user_detail_*',
  'app_popular_companies*',
  'app_search_companies_*',
  'company_watchlist_list_*',
  'professional_detail_list_*',
] as const

export async function invalidateBasicDetailsCaches(): Promise<void> {
  await Promise.all([
    ...BASIC_DETAILS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    invalidateSharedCompanyCaches(),
  ])
}

const COMPANY_LOGO_CACHE_PATTERNS = [
  'app_company_individual_details_*',
  'organizers_list_*',
  'individual_event_*',
  'company_followers_*',
  'app_user_detail_*',
  'app_popular_companies*',
  'app_search_companies_*',
  'company_watchlist_list_*',
  'professional_detail_list_*',
] as const

/** Shared by both update_company_logo and remove_company_logo — identical set in the real source. */
export async function invalidateCompanyLogoCaches(): Promise<void> {
  await Promise.all([
    ...COMPANY_LOGO_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    invalidateSharedCompanyCaches(),
  ])
}

const FOLLOW_CACHE_PATTERNS = [
  'company_list_*',
  'organizers_list_*',
  'company_followers_*',
  'app_user_other_details_*',
  'app_company_individual_details_*',
  'app_company_individual_other_details_*',
  'app_popular_companies*',
  'company_watchlist_list_*',
] as const

/**
 * Shared by follow/unfollow. The real source's per-user key on unfollow
 * (`users_company_following_list_<user_row_id>_*`) is parameterized separately below since it's
 * the one cache key in this file scoped to a specific user rather than a bare wildcard.
 */
export async function invalidateFollowCaches(userRowId?: number): Promise<void> {
  await Promise.all([
    ...FOLLOW_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    invalidateSharedCompanyCaches(),
    deleteKeysByPattern(userRowId ? `users_company_following_list_${userRowId}_*` : 'users_company_following_list_*'),
  ])
}

const REMOVE_FOLLOWER_CACHE_PATTERNS = [
  'company_followers_*',
  'organizers_list_*',
  'app_user_other_details_*',
  'app_company_individual_details_*',
  'app_company_individual_other_details_*',
  'company_watchlist_list_*',
] as const

/**
 * Ports remove_follower's cache set — a real, confirmed subset of invalidateFollowCaches()
 * above (no app_company_list, company_list, app_popular_companies, or following-list key),
 * since removing one follower doesn't change the company's own list-page appearance.
 */
export async function invalidateRemoveFollowerCaches(): Promise<void> {
  await Promise.all([
    ...REMOVE_FOLLOWER_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    deleteKeysByPattern('app_front_page_partners_list_*'),
  ])
}

/**
 * Ports update_social_details' single cache-invalidation call — real, confirmed asymmetry:
 * the source only invalidates on the UPDATE branch (an existing company_social_linksM row),
 * never on the INSERT branch (a brand-new row). Preserved exactly, not fixed here (out of
 * this step's scope — flagged, not a functional break since a first-time social-links save
 * has nothing stale to invalidate anyway).
 */
export async function invalidateSocialDetailsCache(): Promise<void> {
  await deleteKeysByPattern('app_company_individual_details_*')
}

const SEO_CACHE_PATTERNS = ['app_user_detail_*', 'individual_event_*', 'app_company_individual_details_*'] as const

/**
 * `companyId` clears `getCompanySeo`'s own read cache (`buildCompanySeoKey`) for this company -
 * added alongside that GET route's new caching (previously write-only invalidation with nothing
 * on the read side to invalidate). Wildcarded because the read cache's key also encodes the
 * caller's own `user_row_id` when a self-service user's `condition` scopes to their own company;
 * an admin save should still bust a stale self-service-cached read of the same company.
 */
export async function invalidateSeoCaches(companyId: number): Promise<void> {
  await Promise.all([
    ...SEO_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)),
    deleteKeysByPattern(buildCompanySeoKey(companyId, '*')),
  ])
}

/**
 * `scope` is `'admin'` for an unrestricted (admin/sub-admin) caller, or the self-service caller's
 * own `user_row_id` for a `user_type === 1` caller - mirrors `getCompanySeo`'s own `condition`
 * exactly, so the cache key can never serve one caller's scoped result to a different caller for
 * the same `companyId` (see that function's own doc comment).
 */
export function buildCompanySeoKey(companyId: number, scope: number | string): string {
  return `company_seo_${companyId}_${scope}`
}

export function buildCompanyFollowersKey(companyRowId: number): string {
  return `company_followers_${companyRowId}`
}

export { getCache, setCache }
