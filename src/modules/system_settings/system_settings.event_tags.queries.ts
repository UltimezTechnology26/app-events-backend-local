// modules/system_settings/system_settings.event_tags.queries.ts
//
// CRUD data-access for the Event Tags category (`eventTagsM`) plus the
// FIX #2 usage-check filter against `eventM`. The list aggregation
// pipeline lives in system_settings.event_tags.list.queries.ts /
// system_settings.event_tags.list.stages.ts — split out purely to stay
// under the file-length limit.

const eventTagsM = require('../../../models/app/static/event_tagsM')
const eventM = require('../../../models/app/events/eventM')

/**
 * FIX #2 (approved): delete guard filter. Reuses the exact join technique the
 * list aggregation already proves works against `cln_events` —
 * `$expr: { $in: ["$$tagId", "$event_tags"] }` — expressed here as a plain
 * (non-aggregation) filter for use with `eventM.findOne()`, deliberately
 * WITHOUT an `approval_status` restriction so any live event referencing the
 * tag (pending or approved) blocks deletion, not only approved ones.
 */
export function buildEventTagUsageCheckFilter(tagId: number): Record<string, unknown> {
  return { event_tags: { $in: [tagId] } }
}

export async function findEventTagByPattern(pattern: string) {
  return eventTagsM.findOne({ event_tag: { $regex: pattern, $options: 'i' } })
}

export async function insertEventTag(eventTag: unknown, dateNTime: string) {
  return new eventTagsM({ event_tag: eventTag, active_status: true, date_n_time: dateNTime }).save()
}

/** Legacy does NOT wrap this in `$set` — preserved exactly. */
export async function rawUpdateEventTag(requestRowId: number, eventTag: unknown) {
  return eventTagsM.updateOne({ _id: requestRowId }, { event_tag: eventTag })
}

export async function findEventTagByIdAndStatus(requestRowId: number, activeStatus: boolean) {
  return eventTagsM.findOne({ _id: requestRowId, active_status: activeStatus })
}

export async function updateEventTagStatus(requestRowId: number, activeStatus: boolean) {
  return eventTagsM.updateOne({ _id: requestRowId }, { $set: { active_status: activeStatus } })
}

export async function findEventTagById(requestRowId: number) {
  return eventTagsM.findOne({ _id: requestRowId })
}

export async function deleteEventTagById(requestRowId: number) {
  return eventTagsM.deleteOne({ _id: requestRowId })
}

export async function findEventUsingTag(usageFilter: Record<string, unknown>) {
  return eventM.findOne(usageFilter)
}
