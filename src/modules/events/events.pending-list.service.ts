// modules/events/events.pending-list.service.ts
import { EventM } from './events.models'
import { getPresentDateTime } from '../../../utils/helpers/helper'
import { buildPendingEventsMatchQuery, buildPendingEventsPipeline, extractPendingEventsResult } from './events.pending-list.queries'

export interface GetPendingEventsListParams {
  approvalStatusRaw: string
  skipRaw: string
  limitRaw: string
  search?: string
  createdType?: string
  employeeIdRaw?: string
  eventTypeRaw?: string
  startDate?: string
  endDate?: string
  dateTimeRaw?: string
  eventStatusRaw?: string
  profileScoreRange?: string
  tagStatusRaw?: string
}

function parseSkipLimit(skipRaw: string, limitRaw: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { skip, limit }
}

export async function getPendingEventsList(params: GetPendingEventsListParams) {
  const { skip, limit } = parseSkipLimit(params.skipRaw, params.limitRaw)
  const approvalStatus = Number.parseInt(params.approvalStatusRaw)
  const presentTime = getPresentDateTime() as string
  const tagStatusParsed = params.tagStatusRaw !== undefined ? Number.parseInt(params.tagStatusRaw) : undefined
  const tagStatus = tagStatusParsed !== undefined && !Number.isNaN(tagStatusParsed) ? tagStatusParsed : undefined

  const query = buildPendingEventsMatchQuery({
    approvalStatus,
    search: params.search,
    createdType: params.createdType,
    employeeId: params.employeeIdRaw !== undefined ? Number.parseInt(params.employeeIdRaw) : undefined,
    eventType: params.eventTypeRaw !== undefined ? Number.parseInt(params.eventTypeRaw) : undefined,
    startDate: params.startDate,
    endDate: params.endDate,
    dateTime: params.dateTimeRaw !== undefined ? Number.parseInt(params.dateTimeRaw) : undefined,
    eventStatus: params.eventStatusRaw !== undefined ? Number.parseInt(params.eventStatusRaw) : undefined,
    profileScoreRange: params.profileScoreRange,
    presentTime,
  })

  const pipeline = buildPendingEventsPipeline({ query, skip, limit, tagStatus })
  const aggregateOutput = await EventM.aggregate(pipeline)
  const { data, totalCount } = extractPendingEventsResult(aggregateOutput)

  return { status: true, message: data, countQueryRun: totalCount }
}
