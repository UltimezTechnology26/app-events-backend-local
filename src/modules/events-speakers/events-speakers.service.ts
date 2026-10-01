// modules/events-speakers/events-speakers.service.ts
const event_speakersM = require('../../../models/app/events/event_speakersM')
const professionalsM = require('../../../models/app/professionalsM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
import { getPresentDateTime } from '../../../utils/helpers/helper'
import {
  buildSpeakersListPipeline,
  buildSpeakerBasicDetailsRegisteredPipeline,
  buildSpeakerBasicDetailsManualPipeline,
  buildSpeakerEventsPipeline,
  buildSpeakersOverviewPipeline,
} from './events-speakers.queries'

function parseSkipLimit(skipRaw: string, limitRaw: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { skip, limit }
}

export async function getSpeakersList(skipRaw: string, limitRaw: string, search?: string, userTypeRaw?: string, activeTypeRaw?: string) {
  const { skip, limit } = parseSkipLimit(skipRaw, limitRaw)
  const query: Record<string, unknown>[] = [{}]
  if (search) {
    query.push({ $or: [{ full_name: { $regex: search, $options: 'i' } }, { user_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] })
  }
  if (userTypeRaw) {
    const userType = Number.parseInt(userTypeRaw)
    if ([1, 2].includes(userType)) query.push({ user_type: userType })
  }
  const matchEventQuery: Record<string, unknown>[] = [{}]
  if (activeTypeRaw && Number.parseInt(activeTypeRaw) === 1) {
    matchEventQuery.push({ end_date: { $gte: new Date(getPresentDateTime() as string) } })
  }

  const result = await event_speakersM.aggregate(buildSpeakersListPipeline({ matchEventQuery, query, skip, limit }), { allowDiskUse: true })
  const data = result[0]?.data || []
  const count = result[0]?.totalCount?.[0]?.count || 0
  return { status: true, message: { data, count }, cache_response_status: false }
}

export async function getSpeakerBasicDetails(userTypeRaw: string, userRowIdRaw: string) {
  const userType = Number.parseInt(userTypeRaw)
  const userRowId = Number.parseInt(userRowIdRaw)

  if (userType === 1) {
    const result = await professionalsM.aggregate(buildSpeakerBasicDetailsRegisteredPipeline(userRowId)).limit(1)
    return result[0] ? { status: true, message: result[0] } : { status: false, message: { alert_message: 'Sorry, Invalid user type or user row id' } }
  }
  if (userType === 2) {
    const result = await professionals_manual_retrievalsM.aggregate(buildSpeakerBasicDetailsManualPipeline(userRowId)).limit(1)
    return result[0] ? { status: true, message: result[0] } : { status: false, message: { alert_message: 'Sorry, Invalid user type or user row id' } }
  }
  return { status: false, message: { alert_message: 'Sorry, Invalid user type or user row id' } }
}

export async function getSpeakerEvents(userTypeRaw: string, userRowIdRaw: string, search?: string, statusRaw?: string) {
  const userType = Number.parseInt(userTypeRaw)
  const userRowId = Number.parseInt(userRowIdRaw)
  const query: Record<string, unknown>[] = [{}]
  if (search) query.push({ event_title: { $regex: search, $options: 'i' } })
  if (statusRaw) {
    const status = Number.parseInt(statusRaw)
    if (status === 1) query.push({ active_status: 1, approval_status: 0 })
    else if (status === 2) query.push({ active_status: 1, approval_status: 1 })
    else if (status === 3) query.push({ active_status: 1, approval_status: 2 })
    else if (status === 4) query.push({ active_status: 0 })
  }
  const result = await event_speakersM.aggregate(buildSpeakerEventsPipeline({ userType, userRowId, query }))
  return { status: true, message: result }
}

export async function getSpeakersOverview() {
  const presentDateTime = getPresentDateTime() as string
  const result = await event_speakersM.aggregate(buildSpeakersOverviewPipeline(presentDateTime), { allowDiskUse: true })
  const facet = result[0] || {}
  return {
    status: true,
    message: {
      register_count: facet.register_count?.[0]?.count || 0,
      register_active_count: facet.register_active_count?.[0]?.count || 0,
      manual_count: facet.manual_count?.[0]?.count || 0,
      manual_active_count: facet.manual_active_count?.[0]?.count || 0,
    },
  }
}
