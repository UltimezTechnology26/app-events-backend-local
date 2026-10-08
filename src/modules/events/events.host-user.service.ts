// modules/events/events.host-user.service.ts
// Legacy rule (admin-coinpedia events_approvals approveRejectFun): an event can't be approved or
// rejected while its host user's own account is pending (0) or rejected (2) - the user is reviewed
// first. Legacy only enforced it in the list page's UI; this is the server-side check, used by the
// approve/reject requests and by the admin View/Edit pages' popup.
import { findEventHostUser, type EventHostUser } from './events.host-user.queries'

const HOST_USER_PENDING = 0
const HOST_USER_REJECTED = 2

const BLOCKED_MESSAGES: Record<number, string> = {
  [HOST_USER_PENDING]: "This event can't be approved or rejected while its host user's account is pending approval. Approve the user's account first.",
  [HOST_USER_REJECTED]: "This event can't be approved or rejected because its host user's account has been rejected.",
}

function isBlocking(host: EventHostUser | null): host is EventHostUser {
  return host !== null && (host.approval_status === HOST_USER_PENDING || host.approval_status === HOST_USER_REJECTED)
}

/** Null when the review may go ahead; otherwise the response the approve/reject request returns. */
export async function checkHostUserAllowsReview(eventRowId: number) {
  const host = await findEventHostUser(eventRowId)
  if (!isBlocking(host)) return null
  return { status: false, message: { alert_message: BLOCKED_MESSAGES[host.approval_status], host_user_blocked: true } }
}

/** GET host_user_status/:event_row_id - what the admin View/Edit pages need to show the popup. */
export async function getEventHostUserStatus(eventRowIdRaw: string) {
  const eventRowId = Number.parseInt(eventRowIdRaw)
  if (Number.isNaN(eventRowId)) return { status: false, message: { alert_message: 'Sorry, Invalid Request row id' } }

  const host = await findEventHostUser(eventRowId)
  return { status: true, message: { host_user: host, blocked: isBlocking(host) } }
}

/**
 * Mongo filter for an organizer looked up by username. A newly picked organizer must be an approved,
 * active user (legacy rule), but the event's OWN current host stays valid whatever their approval
 * state - otherwise an event listed under a still-pending user can't even be loaded or re-saved in
 * the admin Edit page (its organizer lookup fails and every save is refused as "Invalid Username").
 */
export function organizerUserFilter(userName: string, currentHostRowId: number | null) {
  const approvedActive = { login_status: 1, approval_status: 1 }
  if (!currentHostRowId) return { user_name: userName, ...approvedActive }
  return { user_name: userName, $or: [approvedActive, { _id: currentHostRowId }] }
}
