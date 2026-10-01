// modules/events/events.list.service.ts
//
// Ports controllers/admin_panel/events/event.js's GET /list/:active_status/:skip/:limit
// (line 6439). Behavior preserved: same filters, same response shape
// ({status, message, countQueryRun, ongoingCount, upcomingCount, endedCount}). See
// events.list.queries.ts for the confirmed perf fix (one $facet aggregate instead of two
// separate aggregate calls) and this file for the added read-through cache (legacy route had
// none at all).
import { EventM } from './events.models'
const ticketM = require('../../../models/app/events/ticketM')
import { getPresentDateTime, createDateTime } from '../../../utils/helpers/helper'
import { buildEventsListMatchQuery, buildEventsListPipeline, extractEventsListResult } from './events.list.queries'
import { buildEventsListKey, getCache, setCache, EVENTS_LIST_TTL_SECONDS } from './events.cache'
import { GetEventsListParams } from './events.types'
import { getViewCounts30d } from '../view-counts-30d/view-counts-30d.service'

function parseSkipLimit(skipRaw: string, limitRaw: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { skip, limit }
}

/**
 * Merges `view_count_30d` onto each row AFTER the list's own cache read/write (same pattern as
 * professionals.list.service.ts's withProfessionalViewCounts30d) — a list-cache HIT still gets
 * whatever the view-count cache currently holds, instead of freezing view counts at whatever
 * they were when the list was first cached. Keyed by event_url (this module's public-facing
 * unique slug), matching how view-counts-30d resolves events.coinpedia.org root path segments.
 */
async function withEventViewCounts30d<T extends { event_url?: string }>(rows: T[]): Promise<(T & { view_count_30d: number })[]> {
  const eventUrls = rows.map((row) => row.event_url).filter((url): url is string => Boolean(url))
  const counts = eventUrls.length > 0 ? await getViewCounts30d('event', eventUrls) : {}
  return rows.map((row) => ({ ...row, view_count_30d: row.event_url ? (counts[row.event_url.toLowerCase()] ?? 0) : 0 }))
}

export async function getEventsList(params: GetEventsListParams) {
  const presentTime = getPresentDateTime() as string
  const { skip, limit } = parseSkipLimit(params.skipRaw, params.limitRaw)

  const employeeId = params.employeeIdRaw !== undefined ? Number.parseInt(params.employeeIdRaw) : undefined
  const eventType = params.eventTypeRaw !== undefined ? Number.parseInt(params.eventTypeRaw) : undefined
  const eventStatus = params.eventStatusRaw !== undefined ? Number.parseInt(params.eventStatusRaw) : undefined
  const tagStatusParsed = params.tagStatusRaw !== undefined ? Number.parseInt(params.tagStatusRaw) : undefined
  const tagStatus = tagStatusParsed !== undefined && !Number.isNaN(tagStatusParsed) ? tagStatusParsed : undefined

  const sortOrder = params.sortOrderRaw ? Number.parseInt(params.sortOrderRaw) : -1
  const sortStage: Record<string, 1 | -1> = {}
  if (params.sortBy && (params.sortOrderRaw as unknown) !== '') {
    sortStage[params.sortBy] = sortOrder as 1 | -1
  }

  const cacheKey = buildEventsListKey(skip, limit, { ...params, presentTime: presentTime.slice(0, 10) })
  const cached = await getCache({ key: cacheKey })
  if (cached.status) {
    const cachedResult = cached.message as { status: boolean; message: { event_url?: string }[]; countQueryRun: number; ongoingCount: number; upcomingCount: number; endedCount: number }
    return { ...cachedResult, message: await withEventViewCounts30d(cachedResult.message) }
  }

  // Only run the ticket-exclusion distinct query when the caller actually filters by ticket
  // status, matching the legacy route's own conditional (event.js:102-110) — not run on every
  // request unconditionally.
  const ticketEventRowIds = params.ticket ? await ticketM.distinct('event_row_id') : []

  const query = await buildEventsListMatchQuery({
    ticket: params.ticket,
    search: params.search,
    employeeId,
    eventType,
    startDate: params.startDate,
    endDate: params.endDate,
    eventStatus,
    eventTag: params.eventTag,
    location: params.location,
    createdType: params.createdType,
    profileScoreRange: params.profileScoreRange,
    presentTime,
    ticketEventRowIds,
    createDateTime: createDateTime as (value: string) => string,
  })

  const pipeline = buildEventsListPipeline({ query, skip, limit, tagStatus, sortStage })
  const aggregateOutput = await EventM.aggregate(pipeline)
  const { data, totalCount, ongoingCount, upcomingCount, endedCount } = extractEventsListResult(aggregateOutput, presentTime)

  const result = { status: true, message: data, countQueryRun: totalCount, ongoingCount, upcomingCount, endedCount }
  await setCache({ key: cacheKey, value: result, ttl: EVENTS_LIST_TTL_SECONDS })
  return { ...result, message: await withEventViewCounts30d(data) }
}
