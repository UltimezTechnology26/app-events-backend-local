// modules/events-organisers/events-organisers.service.ts
const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const eventM = require('../../../models/app/events/eventM')
import { buildHostListPipeline, buildHostViewPipeline, buildAdminOrganizersListPipeline, buildAdminOrganizersViewPipeline, extractFacetResult } from './events-organisers.queries'

function parseSkipLimit(skipRaw: string, limitRaw: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100
  return { skip, limit }
}

export async function getHostList(skipRaw: string, limitRaw: string, search?: string) {
  const { skip, limit } = parseSkipLimit(skipRaw, limitRaw)
  const query: Record<string, unknown>[] = [{}]
  if (search) {
    const searchValue = search.trim()
    query.push({
      $or: [
        { user_name: { $regex: searchValue, $options: 'i' } },
        { full_name: { $regex: searchValue, $options: 'i' } },
        { email_id: { $regex: searchValue, $options: 'i' } },
        { company_name: { $regex: searchValue, $options: 'i' } },
        { company_email_id: { $regex: searchValue, $options: 'i' } },
        { company_id: { $regex: searchValue, $options: 'i' } },
      ],
    })
  }
  const pipeline = buildHostListPipeline({ searchQuery: { $and: query }, skip, limit })
  const aggregateOutput = await professionalsM.aggregate(pipeline).collation({ locale: 'en', strength: 2 })
  const { data, count } = extractFacetResult(aggregateOutput)
  return { status: true, message: data, count }
}

export async function getHostView(userRowId: number, filters: { search?: string; listEventType?: string; status?: string; approvalStatus?: string }) {
  if (Number.isNaN(userRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }
  const query: Record<string, unknown>[] = [{ user_row_id: userRowId }]
  if (filters.search) query.push({ event_title: { $regex: filters.search, $options: 'i' } })
  if (filters.listEventType) query.push({ list_event_type: Number.parseInt(filters.listEventType) })
  if (filters.status) {
    const status = Number.parseInt(filters.status)
    if (status === 1) query.push({ active_status: 1, approval_status: 0 })
    else if (status === 2) query.push({ active_status: 1, approval_status: 1 })
    else if (status === 3) query.push({ active_status: 1, approval_status: 2 })
    else if (status === 4) query.push({ active_status: 0 })
  }
  if (filters.approvalStatus) query.push({ approval_status: Number.parseInt(filters.approvalStatus) })

  const eventsList = await eventM.aggregate(buildHostViewPipeline(query))
  return { status: true, message: { events_list: eventsList, counts: eventsList.length }, query }
}

export async function getAdminOrganizersList(skipRaw: string, limitRaw: string, search?: string) {
  const { skip, limit } = parseSkipLimit(skipRaw, limitRaw)
  const query: Record<string, unknown>[] = [{ active_status: 1, total_events: { $gt: 0 } }]
  if (search) {
    query.push({ $or: [{ company_name: { $regex: search, $options: 'i' } }, { company_email_id: { $regex: search, $options: 'i' } }, { company_id: { $regex: search, $options: 'i' } }] })
  }
  const pipeline = buildAdminOrganizersListPipeline({ searchQuery: { $and: query }, skip, limit })
  const aggregateOutput = await companyM.aggregate(pipeline)
  const { data, count } = extractFacetResult(aggregateOutput)
  return { status: true, message: data, count }
}

// Ports controllers/admin_panel/events/event.js's GET /organisers_count (963) - the count tiles
// ("Total Organizers"/"Host, Claimed"/"Admin, Unclaimed") on both Organisers List pages.
export async function getOrganisersCount() {
  const claimedQuery = await professionalsM
    .aggregate([
      { $match: { login_status: 1, approval_status: 1 } },
      { $lookup: { from: 'cln_events', localField: '_id', foreignField: 'user_row_id', as: 'event_info', pipeline: [{ $match: {} }, { $group: { _id: null, count: { $sum: 1 } } }] } },
      { $unwind: { path: '$event_info' } },
      { $lookup: { from: 'cln_company_lists', localField: '_id', foreignField: 'user_row_id', as: 'company_info' } },
      { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
      { $count: 'count' },
    ])
    .collation({ locale: 'en', strength: 2 })

  const unclaimedQuery = await companyM.aggregate([
    { $match: { $or: [{ user_row_id: null }, { user_row_id: 0 }] } },
    { $lookup: { from: 'cln_events', localField: '_id', foreignField: 'company_row_id', as: 'event_info', pipeline: [{ $match: { _id: { $exists: true } } }, { $project: { _id: 1 } }] } },
    { $set: { total_events: { $size: '$event_info' } } },
    { $match: { active_status: 1, total_events: { $gt: 0 } } },
    { $count: 'count' },
  ])

  return {
    status: true,
    message: {
      claimed_organizers: claimedQuery[0]?.count ?? 0,
      unclaimed_organizers: unclaimedQuery[0]?.count ?? 0,
    },
  }
}

export async function getAdminOrganizersView(companyRowId: number, filters: { search?: string; status?: string; approvalStatus?: string }) {
  if (Number.isNaN(companyRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }
  }
  const eventFilterQuery: Record<string, unknown>[] = [{ _id: { $exists: true } }]
  if (filters.search) eventFilterQuery.push({ event_title: { $regex: filters.search, $options: 'i' } })
  if (filters.status) {
    const status = Number.parseInt(filters.status)
    if (status === 1) eventFilterQuery.push({ active_status: 1, approval_status: 0 })
    else if (status === 2) eventFilterQuery.push({ active_status: 1, approval_status: 1 })
    else if (status === 3) eventFilterQuery.push({ active_status: 1, approval_status: 2 })
    else if (status === 4) eventFilterQuery.push({ active_status: 0 })
  }
  if (filters.approvalStatus) eventFilterQuery.push({ approval_status: Number.parseInt(filters.approvalStatus) })

  const companyQuery = await companyM.aggregate(buildAdminOrganizersViewPipeline(companyRowId, eventFilterQuery))
  return { status: true, message: companyQuery }
}
