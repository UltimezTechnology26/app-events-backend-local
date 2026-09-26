// modules/events/events.attendees-invitees.service.ts
//
// Backs the Published Events list's "Total Attendees"/"Total Invitees"/"Watchlist" clickable
// count-cell modals (event.js:1058-1134's `view_more_popup` cells).
const event_attendeesM = require('../../../models/app/events/event_attendeesM')
const event_watchlistsM = require('../../../models/app/watchlist/eventM')
import { buildAttendeesInviteesPipeline } from './events.attendees-invitees.queries'
import { buildWatchlistPipeline } from './events.watchlist.queries'

function extractFacetListResult<T>(aggregateOutput: { data: T[]; countPrep: { count: number }[] }[]): { data: T[]; count: number } {
  const facet = aggregateOutput[0] || { data: [], countPrep: [] }
  return { data: facet.data, count: facet.countPrep?.[0]?.count ?? 0 }
}

export async function getAttendeesInviteesList(eventRowIdRaw: string, invitationStatusRaw: string, search?: string) {
  const eventRowId = Number.parseInt(eventRowIdRaw)
  const invitationStatus = Number.parseInt(invitationStatusRaw)
  if (Number.isNaN(eventRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Event row id' } }
  }
  const aggregateOutput = await event_attendeesM.aggregate(buildAttendeesInviteesPipeline(eventRowId, invitationStatus, search))
  const { data, count } = extractFacetListResult(aggregateOutput)
  return { status: true, message: data, count }
}

export async function getEventWatchlist(eventRowIdRaw: string, search?: string) {
  const eventRowId = Number.parseInt(eventRowIdRaw)
  if (Number.isNaN(eventRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Event row id' } }
  }
  const aggregateOutput = await event_watchlistsM.aggregate(buildWatchlistPipeline(eventRowId, search))
  const { data, count } = extractFacetListResult(aggregateOutput)
  return { status: true, message: data, count }
}
