// modules/events-change-approvals/events.change-approvals.queries.ts
//
// Bulk display-info lookup for the global pending/approved/rejected changes queues - mirrors
// professionals.approvals.queries.ts's findProfessionalsDisplayInfoByIds exactly, one `$in`-scoped
// query instead of N+1 lookups.
const eventM = require('../../../models/app/events/eventM')

export interface EventDisplayInfo {
  _id: number
  event_title: string | null
  event_url: string | null
  event_image: string | null
}

export async function findEventsDisplayInfoByIds(eventRowIds: number[]): Promise<EventDisplayInfo[]> {
  return eventM.find({ _id: { $in: eventRowIds } }, { _id: 1, event_title: 1, event_url: 1, event_image: 1 }).lean()
}
