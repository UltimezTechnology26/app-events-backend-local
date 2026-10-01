// modules/events-location/events-location.service.ts
const event_search_locationM = require('../../../models/app/events/event_search_locationM')
import { buildSearchedLocationsPipeline } from './events-location.queries'

export async function getSearchedLocations(skipRaw: string, limitRaw: string, search?: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100

  const searchQuery = search ? { $or: [{ city: { $regex: search, $options: 'i' } }, { state: { $regex: search, $options: 'i' } }, { country: { $regex: search, $options: 'i' } }] } : {}

  const [data, count] = await Promise.all([event_search_locationM.aggregate(buildSearchedLocationsPipeline({ searchQuery, skip, limit })), event_search_locationM.countDocuments(searchQuery)])

  return { status: true, message: data, count }
}
