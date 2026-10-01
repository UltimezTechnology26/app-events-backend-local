// modules/events/events.published-overview.service.ts
//
// Backs the Published Events page's 3 summary cards ("Total Events" / "Events Created by our
// Team" / "Events Created Through the User Panel") and its "Select Subadmin" filter dropdown.
// Ported from event.js's GET /overview (the published-events-card slice of it, see
// events.published-overview.queries.ts) and GET /employees (event.js:5187).
import { EventM } from './events.models'
import { getPresentDateTime } from '../../../utils/helpers/helper'
import { buildPublishedOverviewPipeline, extractPublishedOverviewResult } from './events.published-overview.queries'
import { buildEventsEmployeesPipeline } from './events.employees.queries'
import { getCache, setCache } from './events.cache'

const PUBLISHED_OVERVIEW_TTL_SECONDS = 30
const EMPLOYEES_TTL_SECONDS = 300

export async function getPublishedEventsOverview() {
  const presentTime = getPresentDateTime() as string
  const cacheKey = `events_list_published_overview_${presentTime.slice(0, 10)}`
  const cached = await getCache({ key: cacheKey })
  if (cached.status) {
    return { status: true, message: cached.message }
  }

  const aggregateOutput = await EventM.aggregate(buildPublishedOverviewPipeline(presentTime))
  const message = extractPublishedOverviewResult(aggregateOutput)
  await setCache({ key: cacheKey, value: message, ttl: PUBLISHED_OVERVIEW_TTL_SECONDS })
  return { status: true, message }
}

export async function getEventsEmployees() {
  const cacheKey = 'events_list_employees'
  const cached = await getCache({ key: cacheKey })
  if (cached.status) {
    return { status: true, message: cached.message }
  }

  const message = await EventM.aggregate(buildEventsEmployeesPipeline())
  if (!message.length) {
    return { status: false, message: { alert_message: 'Sorry, No related employees found.' } }
  }
  await setCache({ key: cacheKey, value: message, ttl: EMPLOYEES_TTL_SECONDS })
  return { status: true, message }
}
