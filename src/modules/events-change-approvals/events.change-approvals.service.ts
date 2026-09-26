// modules/events-change-approvals/events.change-approvals.service.ts
//
// Global cross-event pending/approved/rejected changes queues - mirrors
// professionals.approvals.service.ts's getGlobalPendingChangeRequestsForProfessionals (and its
// approved/rejected siblings) exactly, parameterized with AUDIT_MODULE_EVENTS and enriched with
// event display info (title/url/image) instead of professional name/username/avatar.
import { getPendingChangeRequestsAcrossEntities, getRejectedChangeRequestsAcrossEntities, getApprovedChangeRequestsAcrossEntities } from '../../modules/change-request/change-request.service'
import { AUDIT_MODULE_EVENTS } from '../../common/status-audit/status-audit.registry'
import { findEventsDisplayInfoByIds } from './events.change-approvals.queries'

export interface GetGlobalEventChangesParams {
  skipRaw: string
  limitRaw: string
}

export interface EventChangeQueueEntity {
  event_row_id: number
  event_title: string | null
  event_url: string | null
  event_image: string | null
}

function buildEntityById(events: { _id: number; event_title?: string | null; event_url?: string | null; event_image?: string | null }[]) {
  return new Map(events.map((event) => [event._id, event]))
}

function toEntity(event: { _id: number; event_title?: string | null; event_url?: string | null; event_image?: string | null } | undefined): EventChangeQueueEntity | null {
  if (!event) return null
  return {
    event_row_id: event._id,
    event_title: event.event_title ?? null,
    event_url: event.event_url ?? null,
    event_image: event.event_image ?? null,
  }
}

export interface PendingEventChangeQueueRow {
  change_request_id: number
  section: string
  revision: number
  requested_by: unknown
  requested_at: Date
  changes: unknown[]
  root_document_id: number
  entity: EventChangeQueueEntity | null
}

export async function getGlobalPendingChangeRequestsForEvents({ skipRaw, limitRaw }: GetGlobalEventChangesParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { message: requests, count } = await getPendingChangeRequestsAcrossEntities({ module: AUDIT_MODULE_EVENTS, skip, limit })

  const eventRowIds = Array.from(new Set(requests.map((request) => request.root_document_id)))
  const events = eventRowIds.length > 0 ? await findEventsDisplayInfoByIds(eventRowIds) : []
  const eventById = buildEntityById(events)

  const data: PendingEventChangeQueueRow[] = requests.map((request) => ({
    ...request,
    entity: toEntity(eventById.get(request.root_document_id)),
  }))

  return { status: true, message: data, count }
}

export interface RejectedEventChangeQueueRow {
  change_request_id: number
  section: string
  revision: number
  requested_by: unknown
  requested_at: Date
  reviewed_by: unknown
  reviewed_at: Date | null
  reason: string | null
  changes: unknown[]
  root_document_id: number
  entity: EventChangeQueueEntity | null
}

export async function getGlobalRejectedChangeRequestsForEvents({ skipRaw, limitRaw }: GetGlobalEventChangesParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { message: requests, count } = await getRejectedChangeRequestsAcrossEntities({ module: AUDIT_MODULE_EVENTS, skip, limit })

  const eventRowIds = Array.from(new Set(requests.map((request) => request.root_document_id)))
  const events = eventRowIds.length > 0 ? await findEventsDisplayInfoByIds(eventRowIds) : []
  const eventById = buildEntityById(events)

  const data: RejectedEventChangeQueueRow[] = requests.map((request) => ({
    ...request,
    entity: toEntity(eventById.get(request.root_document_id)),
  }))

  return { status: true, message: data, count }
}

export interface ApprovedEventChangeQueueRow {
  change_request_id: number
  section: string
  revision: number
  requested_by: unknown
  requested_at: Date
  reviewed_by: unknown
  reviewed_at: Date | null
  rating: number | null
  note: string | null
  changes: unknown[]
  root_document_id: number
  derived_status?: 'pending' | 'partially_completed' | 'resolved'
  entity: EventChangeQueueEntity | null
}

export async function getGlobalApprovedChangeRequestsForEvents({ skipRaw, limitRaw }: GetGlobalEventChangesParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 20

  const { message: requests, count } = await getApprovedChangeRequestsAcrossEntities({ module: AUDIT_MODULE_EVENTS, skip, limit })

  const eventRowIds = Array.from(new Set(requests.map((request) => request.root_document_id)))
  const events = eventRowIds.length > 0 ? await findEventsDisplayInfoByIds(eventRowIds) : []
  const eventById = buildEntityById(events)

  const data: ApprovedEventChangeQueueRow[] = requests.map((request) => ({
    ...request,
    entity: toEntity(eventById.get(request.root_document_id)),
  }))

  return { status: true, message: data, count }
}
