// modules/events-location/events-location-detail.service.ts
//
// Backs the Location List page's "View" modal - 2 tabs sharing one route
// (GET /searched_users_list/:type/:location_row_id/:skip/:limit), same as legacy.
const event_search_locationM = require('../../../models/app/events/event_search_locationM')
const professionals_location_searchM = require('../../../models/app/events/professionals_location_searchM')
import { buildCreatedEventsPipeline, buildLocationDetailDateMatch, buildRegisteredUsersPipeline, extractFacetListResult } from './events-location-detail.queries'

export interface GetLocationDetailParams {
  typeRaw: string
  locationRowIdRaw: string
  skipRaw: string
  limitRaw: string
  dateRangeRaw?: string
  startDate?: string
  endDate?: string
}

function parseIntOr(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '')
  return Number.isNaN(parsed) ? fallback : parsed
}

export async function getLocationDetail(params: GetLocationDetailParams) {
  const type = parseIntOr(params.typeRaw, 0)
  const locationRowId = parseIntOr(params.locationRowIdRaw, 0)
  const skip = parseIntOr(params.skipRaw, 0)
  const limit = parseIntOr(params.limitRaw, 100)
  const dateRange = params.dateRangeRaw !== undefined ? Number.parseInt(params.dateRangeRaw) : undefined
  const dateMatch = buildLocationDetailDateMatch(dateRange, params.startDate, params.endDate)

  if (type === 1) {
    const matchQuery = [{ location_row_id: locationRowId }, ...dateMatch]
    const aggregateOutput = await professionals_location_searchM.aggregate(buildRegisteredUsersPipeline(matchQuery, skip, limit))
    const { data, count } = extractFacetListResult(aggregateOutput)
    return { status: true, message: data, count }
  }

  const aggregateOutput = await event_search_locationM.aggregate(buildCreatedEventsPipeline(locationRowId, dateMatch, skip, limit))
  const { data, count } = extractFacetListResult(aggregateOutput)
  return { status: true, message: data, count }
}
