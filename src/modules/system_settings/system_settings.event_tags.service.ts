// modules/system_settings/system_settings.event_tags.service.ts
//
// Ports controllers/admin_panel/category_tags/event_tags.js's GET /list,
// POST /save, POST /update/:request_row_id. Enable/disable/delete live in
// system_settings.event_tags.status.service.ts — split out purely to stay
// under the file-length limit. Two approved fixes and documented
// divergences from the task brief's inline snippets (the brief's snippets
// were not followed where they diverged from the real legacy file, per
// the migration's own rules):
//
// - FIX #1: the legacy save/update handlers call `res.json(errObj)` on a
//   validation failure WITHOUT `return`ing, so execution falls through into
//   the duplicate-check and (if no duplicate is found) the save/update still
//   runs despite the invalid input. Fixed here by returning immediately.
// - Divergence: the legacy save handler never persists `keywords` (its
//   express-validator check for it is commented out AND the `.save()` call
//   itself omits the field), and the legacy update handler never touches
//   `keywords` either (also commented out). Preserved exactly — `keywords`
//   is accepted on the input type for forward-compatibility but is not
//   written by either function, matching the real file rather than the
//   brief's inline snippet (which set it on save).
// - Divergence: the legacy update handler's duplicate-name check queries
//   ALL tags (it does not exclude the row being updated by `_id`), unlike
//   the brief's placeholder-free stand-in which excluded it via `$ne`.
//   Preserved exactly as the legacy behavior, even though it means
//   re-submitting a tag's own unchanged name always triggers the duplicate
//   error.
// - Divergence: the legacy update handler has no existence check at all —
//   it always calls `updateOne` and always responds with the success
//   message, exactly like `updateExperienceLevel`. Preserved exactly rather
//   than the brief's inline snippet, which added a "not found" branch.

const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { extractPaginatedResult, buildPaginatedFacetStages } from '../common/common.pagination'
import { validateEventTagInput, EventTagInput } from './system_settings.event_tags.validation'
import { buildEventTagsListStages, fetchEventTagsList } from './system_settings.event_tags.list.queries'
import { findEventTagByPattern, insertEventTag, rawUpdateEventTag } from './system_settings.event_tags.queries'
import { invalidateEventTagsCaches } from './system_settings.cache'
import { Actor } from './system_settings.types'

function escapeRegexForEventTag(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

export interface ListEventTagsParams {
  actor: Actor
  search?: string
  activeStatus?: string
  skip: number
  limit: number
}

/** Ports event_tags.js's GET /list (lines 12-167). */
export async function listEventTags({ actor, search, activeStatus, skip, limit }: ListEventTagsParams) {
  if (!actor.status) {
    return actor
  }

  const stages = buildEventTagsListStages({ search, active_status: activeStatus })
  const paginated = [...stages, ...buildPaginatedFacetStages({ skip, limit })]
  const aggregateOutput = await fetchEventTagsList(paginated)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  // NOTE: legacy event_tags.js's GET /list response does NOT include `tokenStatus`
  // (unlike its save/update/enable/disable/delete responses, which all do) — preserved
  // exactly, no tokenStatus added here.
  return { status: true, message: data, count }
}

export interface SaveEventTagParams {
  actor: Actor
  input: EventTagInput
}

/** Ports event_tags.js's POST /save (lines 170-220), with FIX #1 applied. */
export async function saveEventTag({ actor, input }: SaveEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateEventTagInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  const cleanEventTag = (input.event_tag as string).trim()
  const isExists = await findEventTagByPattern('^' + escapeRegexForEventTag(cleanEventTag) + '$')

  if (isExists) {
    return { status: false, message: { event_tag: 'This event tag already exists.' } }
  }

  await insertEventTag(input.event_tag, getPresentDateTime())
  await invalidateEventTagsCaches()

  return { status: true, message: { alert_message: 'New Event tag created successfully.' }, tokenStatus: true }
}

export interface UpdateEventTagParams {
  actor: Actor
  requestRowId: number
  input: EventTagInput
}

/** Ports event_tags.js's POST /update/:request_row_id (lines 222-275), with FIX #1 applied. */
export async function updateEventTag({ actor, requestRowId, input }: UpdateEventTagParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateEventTagInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  const cleanEventTag = (input.event_tag as string).trim()
  const isExists = await findEventTagByPattern('^' + escapeRegexForEventTag(cleanEventTag) + '$')

  if (isExists) {
    return { status: false, message: { event_tag: 'This event tag already exists.' } }
  }

  await rawUpdateEventTag(requestRowId, input.event_tag)
  await invalidateEventTagsCaches()

  return { status: true, message: { alert_message: 'Event tag updated successfully.' }, tokenStatus: true }
}
