// modules/system_settings/system_settings.cache.ts
const { deleteKeysByPattern } = require('../../config/cache_helper')

// ==== Experience Level ====
// The legacy experience_level.js controller has NO caching at all for this
// category (confirmed by reading the full file — no getCache/setCache calls
// anywhere). Per "preserve business logic exactly," no caching or
// invalidation is added here. Later tasks add real per-category
// invalidation exports to this same file for the categories that do cache.

// ==== Event Tags ====
//
// Ports controllers/admin_panel/category_tags/event_tags.js's cache
// invalidation exactly: every mutating route (save, update, enable, disable,
// delete) calls `await deleteKeysByPattern('backend_event_tags_list*')` after
// its write. The key string is preserved verbatim — it is not renamed to
// match another module's convention, since nothing else invalidates or
// reads this key today and renaming would silently stop invalidating
// whatever currently depends on the old key name if anything does.

export const EVENT_TAGS_CACHE_PATTERNS = ['backend_event_tags_list*'] as const

export async function invalidateEventTagsCaches(): Promise<void> {
  await Promise.all(EVENT_TAGS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

// ==== Area of Interests ====
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's cache
// invalidation, with one deliberate, documented standardization: the legacy
// file itself is INCONSISTENT — enable_looking/disable_looking both call
// `deleteKeysByPattern('app_users_professional_details*')` (WITH a trailing
// `*`, a Redis glob wildcard), but delete_looking_for calls
// `deleteKeysByPattern('app_users_professional_details')` (WITHOUT it), and
// save_n_add_user_looking/update_looking use the WITH-star form. Since a
// literal key without any wildcard only matches an exact key named
// `app_users_professional_details`, the star-less delete call was almost
// certainly an accidental one-off, not an intentional narrower invalidation.
// Per the task brief, this section standardizes on the trailing-`*` pattern
// for every mutation (save/update/enable/disable/delete alike) rather than
// preserving the accidental inconsistency verbatim.

export const AREA_OF_INTERESTS_CACHE_PATTERNS = ['app_users_professional_details*'] as const

export async function invalidateAreaOfInterestsCaches(): Promise<unknown[]> {
  return Promise.all(AREA_OF_INTERESTS_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

// ==== User Expertise ====
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's cache
// invalidation. Confirmed by reading the real legacy file in full (Step 1):
// this controller invalidates the EXACT SAME literal key namespace as
// area_of_interests.js above — `app_users_professional_details*` — because
// both `designation_id` and `looking_for_id` are professional attributes
// surfaced together on the same cached admin-panel professional list. This
// sharing is intentional/real (both legacy files genuinely target the
// identical string), not a naming coincidence.
//
// This legacy file has its OWN inconsistency, distinct in shape from
// area_of_interests.js's (which was isolated to delete_looking_for only):
// save_n_add_position/update_position use the trailing-`*` form, but
// enable_position/disable_position/delete_position ALL use the star-less
// literal `'app_users_professional_details'`. Per the same reasoning
// already applied to area_of_interests.js, this section standardizes on the
// trailing-`*` pattern for every mutation rather than preserving the
// accidental inconsistency verbatim.
//
// A separate export (rather than reusing `invalidateAreaOfInterestsCaches`
// directly, or extracting a new cross-category helper into
// `modules/common/common.cache-patterns.ts` following the
// `SHARED_COMPANY_CACHE_PATTERNS` precedent) is used here deliberately:
// Task 4's `invalidateAreaOfInterestsCaches` is already-reviewed, landed
// code, and this task's scope is to APPEND new sections, not to edit
// previously-approved call sites. Both exports invalidate the identical key
// string today, so behavior is unaffected either way; a future cleanup task
// can consolidate the two into a shared `common.cache-patterns.ts` helper if
// desired.

export const USER_EXPERTISE_CACHE_PATTERNS = ['app_users_professional_details*'] as const

export async function invalidateUserExpertiseCaches(): Promise<unknown[]> {
  return Promise.all(USER_EXPERTISE_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}
