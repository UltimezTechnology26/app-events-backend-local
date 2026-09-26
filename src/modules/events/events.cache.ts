// modules/events/events.cache.ts
//
// The legacy /list route (event.js:6439) had NO caching at all, despite being read on every
// "Overview" and "Published Events" admin page load/filter change — a real gap against this
// repo's CLAUDE.md caching rule ("any read that's expensive or hit frequently... gets cached").
// Adding a short-TTL read-through cache here, following professionals.cache.ts's established
// pattern (parameterized key + deleteKeysByPattern invalidation), rather than leaving the gap in
// place just because the legacy route never had one.
import { getCache, setCache, deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'

/** Every write route in this module (edit/enable/disable/delete/submit) invalidates this pattern. */
export const EVENTS_LIST_CACHE_PATTERN = 'events_list_*'

/**
 * The legacy cache patterns each write route already invalidated (event.js/events_listed.js's
 * own deleteKeysByPattern calls) — other parts of the app (app-side lists, individual event
 * pages, speaker lists, tag lists) still read these keys, so a ported write path must keep
 * clearing them, not just this module's own new events_list_* key. Legacy routes didn't all
 * invalidate the exact same set (CLAUDE.md's own documented "half-fixed" gotcha — e.g. delete
 * skips app_company_individual_other_details_*, which enable/disable don't); each function below
 * matches its real legacy route's own list, not a superset.
 */
async function deleteAll(patterns: string[]): Promise<void> {
  await Promise.all(patterns.map((pattern) => deleteKeysByPattern(pattern)))
}

export async function invalidateEventsListCache(): Promise<void> {
  await deleteKeysByPattern(EVENTS_LIST_CACHE_PATTERN)
}

/** Matches enable_event/disable_event's own 4 patterns (event.js:7729/7842). */
export async function invalidateEventLifecycleCaches(): Promise<void> {
  await deleteAll(['all_events_*', 'users_registered_list_*', 'manage_events_list_*', 'app_company_individual_other_details_*'])
  await invalidateEventsListCache()
}

/** Matches delete_event's own 3 patterns (event.js:7959, via deleteEvent). */
export async function invalidateEventDeleteCaches(): Promise<void> {
  await deleteAll(['users_registered_list_*', 'all_events_*', 'manage_events_list_*'])
  await invalidateEventsListCache()
}

/** Matches approve_event/reject_event's own 3 patterns (event.js:9336/9831) - same set delete_event
 *  clears, minus app_company_individual_other_details_* (neither legacy route touches it). */
export async function invalidateEventApprovalCaches(): Promise<void> {
  await deleteAll(['users_registered_list_*', 'all_events_*', 'manage_events_list_*'])
  await invalidateEventsListCache()
}

/** Matches edit_event's own 7 patterns (event.js:5636). */
export async function invalidateEventEditCaches(): Promise<void> {
  await deleteAll(['all_events_*', 'individual_event_*', 'users_registered_list_*', 'events_watchlist_*', 'app_company_individual_other_details_*', 'manage_events_list_*', 'app_user_other_details_*'])
  await invalidateEventsListCache()
}

/** Matches submit_event's own 9 patterns (events_listed.js:1652, both create and update paths). */
export async function invalidateEventSubmitCaches(): Promise<void> {
  await deleteAll(['all_events_*', 'individual_event_*', 'users_registered_list_*', 'events_watchlist_*', 'app_company_individual_other_details_*', 'speakers_list*', 'manage_events_list_*', 'app_user_other_details_*', 'backend_event_tags_list*'])
  await invalidateEventsListCache()
}

/**
 * A change-request publish for any of Events' list-type sections (Contact, Speaker,
 * Sponsor/Partner, Ticket, FAQ, Attendee) writes into that section's own collection, but each
 * section's own GET /list route (events_listed.js, event_ticket.js, faq.js, attendees.js,
 * sponsors_n_partners.js) reads through its OWN per-event Redis cache key
 * (`contacts_list_*`, `event_speakers_list_*`/`speakers_list*`, `event_sponsor_list_*`,
 * `ticket_list_*`, `event_faq_list_*`, `event_attendees_list_*`) - none of which
 * `invalidateEventEditCaches` clears (it matches a different, unrelated legacy route's own
 * pattern set). Without this, a published list-section change stays invisible in the Edit form's
 * own list (even after a hard refresh) until that key's TTL expires, though it already shows
 * correctly anywhere that bypasses the cache (e.g. the View page). Coupons has no such cache
 * (its list route reads straight from Mongo), so no pattern is needed for it.
 */
export async function invalidateEventChangeRequestCaches(): Promise<void> {
  await invalidateEventEditCaches()
  await deleteAll(['contacts_list_*', 'event_speakers_list_*', 'speakers_list*', 'event_sponsor_list_*', 'ticket_list_*', 'event_faq_list_*', 'event_attendees_list_*'])
}

export function buildEventsListKey(skip: number, limit: number, params: Record<string, unknown>): string {
  return `events_list_${skip}_${limit}_${JSON.stringify(params || {})}`
}

// Read on every admin-panel page/filter change; short TTL bounds staleness after a write without
// re-running the full aggregate on every request.
export const EVENTS_LIST_TTL_SECONDS = 30

export { getCache, setCache }
