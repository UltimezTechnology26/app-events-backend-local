// modules/events/events.host-user.queries.ts
// The event's host user (the professional it's listed under, `user_row_id`) - only the fields the
// admin approve/reject guard and its popup need. Two indexed _id lookups, deliberately uncached:
// the guard must see a host user's approval the moment it lands.
const eventM = require('../../../models/app/events/eventM')
const professionalsM = require('../../../models/app/professionalsM')

export interface EventHostUser {
  user_row_id: number
  approval_status: number
  full_name: string
  user_name: string
}

export async function findEventHostUser(eventRowId: number): Promise<EventHostUser | null> {
  const event = await eventM.findOne({ _id: eventRowId }, { user_row_id: 1 }).lean()
  if (!event?.user_row_id) return null

  const user = await professionalsM.findOne({ _id: event.user_row_id }, { approval_status: 1, full_name: 1, user_name: 1 }).lean()
  if (!user) return null

  return {
    user_row_id: user._id,
    approval_status: user.approval_status,
    full_name: user.full_name ?? '',
    user_name: user.user_name ?? '',
  }
}

/** Just the event's host user id (0/absent = no host) - for the organizer checks that only need to recognise them. */
export async function findEventHostRowId(eventRowId: number): Promise<number | null> {
  if (Number.isNaN(eventRowId)) return null
  const event = await eventM.findOne({ _id: eventRowId }, { user_row_id: 1 }).lean()
  return event?.user_row_id || null
}
