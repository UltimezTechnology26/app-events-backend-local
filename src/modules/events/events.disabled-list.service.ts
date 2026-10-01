// modules/events/events.disabled-list.service.ts
import { EventM } from './events.models'
import { buildDisabledEventsListMatchQuery, buildDisabledEventsListPipeline, extractDisabledEventsListResult } from './events.disabled-list.queries'
import { buildEventsListKey, getCache, setCache, EVENTS_LIST_TTL_SECONDS } from './events.cache'

export interface GetDisabledEventsListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  listEventTypeRaw?: string
  createdByAdminStatusRaw?: string
  profileScoreRange?: string
  eventTag?: string
  tagStatusRaw?: string
}

function parseSkipLimit(skipRaw: string, limitRaw: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { skip, limit }
}

export async function getDisabledEventsList(params: GetDisabledEventsListParams) {
  const { skip, limit } = parseSkipLimit(params.skipRaw, params.limitRaw)
  const tagStatusParsed = params.tagStatusRaw !== undefined ? Number.parseInt(params.tagStatusRaw) : undefined
  const tagStatus = tagStatusParsed !== undefined && !Number.isNaN(tagStatusParsed) ? tagStatusParsed : undefined

  const cacheKey = buildEventsListKey(skip, limit, { disabledList: true, ...params })
  const cached = await getCache({ key: cacheKey })
  if (cached.status) {
    return cached.message as { status: boolean; message: unknown[]; countQueryRun: number }
  }

  const query = await buildDisabledEventsListMatchQuery({
    search: params.search,
    listEventType: params.listEventTypeRaw !== undefined ? Number.parseInt(params.listEventTypeRaw) : undefined,
    createdByAdminStatus: params.createdByAdminStatusRaw !== undefined ? Number.parseInt(params.createdByAdminStatusRaw) : undefined,
    profileScoreRange: params.profileScoreRange,
    eventTag: params.eventTag,
  })

  const pipeline = buildDisabledEventsListPipeline({ query, skip, limit, tagStatus })
  const aggregateOutput = await EventM.aggregate(pipeline)
  const { data, totalCount } = extractDisabledEventsListResult(aggregateOutput)

  const result = { status: true, message: data, countQueryRun: totalCount }
  await setCache({ key: cacheKey, value: result, ttl: EVENTS_LIST_TTL_SECONDS })
  return result
}
