// modules/events/events.deleted-list.service.ts
import { DeletedEventsM } from './events.models'
import { getPresentDateTime, createDateTime } from '../../../utils/helpers/helper'
import { buildDeletedEventsListMatchQuery, buildDeletedEventsListPipeline, extractDeletedEventsListResult } from './events.deleted-list.queries'
import { buildEventsListKey, getCache, setCache, EVENTS_LIST_TTL_SECONDS } from './events.cache'

export interface GetDeletedEventsListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  employeeIdRaw?: string
  eventTypeRaw?: string
  activeStatusRaw?: string
  approvalStatusRaw?: string
  startDate?: string
  endDate?: string
  eventStatusRaw?: string
  eventTag?: string
  location?: string
  createdType?: string
  tagStatusRaw?: string
}

function parseSkipLimit(skipRaw: string, limitRaw: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { skip, limit }
}

export async function getDeletedEventsList(params: GetDeletedEventsListParams) {
  const { skip, limit } = parseSkipLimit(params.skipRaw, params.limitRaw)
  const presentDateTime = new Date(getPresentDateTime() as string)
  const tagStatusParsed = params.tagStatusRaw !== undefined ? Number.parseInt(params.tagStatusRaw) : undefined
  const tagStatus = tagStatusParsed !== undefined && !Number.isNaN(tagStatusParsed) ? tagStatusParsed : undefined

  const cacheKey = buildEventsListKey(skip, limit, { deletedList: true, ...params })
  const cached = await getCache({ key: cacheKey })
  if (cached.status) {
    return cached.message as { status: boolean; message: unknown[]; count: number }
  }

  const topFilterArray = await buildDeletedEventsListMatchQuery({
    search: params.search,
    employeeId: params.employeeIdRaw !== undefined ? Number.parseInt(params.employeeIdRaw) : undefined,
    eventType: params.eventTypeRaw !== undefined ? Number.parseInt(params.eventTypeRaw) : undefined,
    activeStatus: params.activeStatusRaw !== undefined ? Number.parseInt(params.activeStatusRaw) : undefined,
    approvalStatus: params.approvalStatusRaw !== undefined ? Number.parseInt(params.approvalStatusRaw) : undefined,
    startDate: params.startDate,
    endDate: params.endDate,
    eventStatus: params.eventStatusRaw !== undefined ? Number.parseInt(params.eventStatusRaw) : undefined,
    eventTag: params.eventTag,
    location: params.location,
    createdType: params.createdType,
    presentDateTime,
    createDateTime: createDateTime as (value: string) => string,
  })

  const pipeline = buildDeletedEventsListPipeline({ topFilterArray, skip, limit, tagStatus })
  const aggregateOutput = await DeletedEventsM.aggregate(pipeline)
  const { data, totalCount } = extractDeletedEventsListResult(aggregateOutput)

  const result = { status: true, message: data, count: totalCount }
  await setCache({ key: cacheKey, value: result, ttl: EVENTS_LIST_TTL_SECONDS })
  return result
}
