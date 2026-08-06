// modules/company/company.settings.cache.ts
const { getCache, setCache, deleteKeysByPattern } = require('../../../config/cache_helper')
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

export async function invalidateSeoCaches(): Promise<void> {
  await Promise.all(SEO_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

export function buildCompanyFollowersKey(companyRowId: number): string {
  return `company_followers_${companyRowId}`
}

export { getCache, setCache }
