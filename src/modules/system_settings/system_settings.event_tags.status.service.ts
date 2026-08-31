// modules/system_settings/system_settings.event_tags.status.service.ts
//
// Ports controllers/admin_panel/category_tags/event_tags.js's GET
// /enable/:request_row_id, GET /disable/:request_row_id, GET
// /delete/:request_row_id. Split out of
// system_settings.event_tags.service.ts purely to stay under the
// file-length limit.
//
// - FIX #2: `deleteEventTag` refuses deletion when `cln_events` still has
//   a document whose `event_tags` array contains this tag id (checked only
//   against live events via `eventM`, not `cln_deleted_events` — the
//   legacy list aggregation's `deleted_count` lookup is purely a display
//   stat, and a tag referenced only by an already soft-deleted event is not
//   "still referenced" in the sense fix #2 is meant to guard against).

import {
  buildEventTagUsageCheckFilter,
  findEventTagByIdAndStatus,
  updateEventTagStatus,
  findEventTagById,
  deleteEventTagById,
  findEventUsingTag,
} from './system_settings.event_tags.queries'
import { invalidateEventTagsCaches } from './system_settings.cache'
import { Actor } from './system_settings.types'

export interface ToggleEventTagParams {
  actor: Actor
  requestRowId: number
}

/** Ports event_tags.js's GET /enable/:request_row_id (lines 277-301). */
export async function enableEventTag({ actor, requestRowId }: ToggleEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findEventTagByIdAndStatus(requestRowId, false)
  if (checkQuery) {
    await updateEventTagStatus(requestRowId, true)
    await invalidateEventTagsCaches()
    return { status: true, message: { alert_message: 'This Event Tag enabled successfully.' }, tokenStatus: true }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Event Tag id  or already enabled.' },
    tokenStatus: true,
  }
}

/** Ports event_tags.js's GET /disable/:request_row_id (lines 303-327), mirror of enable above. */
export async function disableEventTag({ actor, requestRowId }: ToggleEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findEventTagByIdAndStatus(requestRowId, true)
  if (checkQuery) {
    await updateEventTagStatus(requestRowId, false)
    await invalidateEventTagsCaches()
    return { status: true, message: { alert_message: 'This Event Tag disabled successfully.' }, tokenStatus: true }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Event Tag id  or already disabled.' },
    tokenStatus: true,
  }
}

export interface DeleteEventTagParams {
  actor: Actor
  requestRowId: number
}

/** Ports event_tags.js's GET /delete/:request_row_id (lines 329-353), with FIX #2 applied. */
export async function deleteEventTag({ actor, requestRowId }: DeleteEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const usageFilter = buildEventTagUsageCheckFilter(requestRowId)
  const inUse = await findEventUsingTag(usageFilter)
  if (inUse) {
    return {
      status: false,
      message: { alert_message: 'This event tag is still used by an event and cannot be deleted.' },
      tokenStatus: true,
    }
  }

  const checkQuery = await findEventTagById(requestRowId)
  if (checkQuery) {
    await deleteEventTagById(requestRowId)
    await invalidateEventTagsCaches()
    return { status: true, message: { alert_message: 'This Event Tag deleted successfully.' }, tokenStatus: true }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid Event Tag id ' }, tokenStatus: true }
}
