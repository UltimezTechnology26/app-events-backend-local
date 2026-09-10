import { ActorRef, FieldChange } from '../status-audit/status-audit.types'

export const CHANGE_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  PUBLISHED: 'published',
} as const

export type ChangeRequestStatus = typeof CHANGE_REQUEST_STATUS[keyof typeof CHANGE_REQUEST_STATUS]

export const CHANGE_REQUEST_ACTION = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
} as const

export type ChangeRequestAction = typeof CHANGE_REQUEST_ACTION[keyof typeof CHANGE_REQUEST_ACTION]

export interface SubmitChangeRequestParams {
  module: string
  section: string
  rootDocumentId: number
  targetRowId: number | null
  submitted: Record<string, unknown>
  actor: ActorRef
}

export interface SubmitChangeRequestResult {
  status: boolean
  message: { alert_message: string }
  changeRequestId?: number
  changeCount?: number
}

export interface PendingChangeSummary {
  change_request_id: number
  section: string
  // Always PENDING — findPendingRequestsForEntity's query is already filtered to this status.
  // Frontend's PendingChangesFeedItem requires this field to decide whether to show
  // Approve/Reject/Cancel at all (CONFIRMED BUG FIX: this was missing entirely, so those buttons
  // never rendered for ANY section using CompanyPendingChangesBanner — a real, silent gap found
  // via live browser verification, not a hypothetical).
  status: typeof CHANGE_REQUEST_STATUS.PENDING
  revision: number
  requested_by: ActorRef
  requested_at: Date
  changes: FieldChange[]
  // 'delete' requests carry no field-level diff (there is nothing to compare a removed row
  // against) - a reviewer-facing list showing "0 fields changed" for a real deletion reads as a
  // bug/empty request rather than what it is, so callers need this to render "Deletion" instead.
  action: ChangeRequestAction
  // Field-level approval only (see FieldChange.status's doc comment) - lets the Pending Changes
  // list show a "Partially Completed" badge once some but not all of this request's fields have
  // been resolved. Absent on every request that doesn't use field-level approval.
  derived_status?: 'pending' | 'partially_completed' | 'resolved'
}

export interface ApprovedChangeSummary {
  change_request_id: number
  section: string
  // Always APPROVED — findApprovedRequestsForEntity's query is already filtered to this status.
  // Same CONFIRMED BUG FIX as PendingChangeSummary above: PendingChangesFeedItem's showPublish
  // check (`item.status === "approved"`) could never be true without this field.
  status: typeof CHANGE_REQUEST_STATUS.APPROVED
  revision: number
  requested_by: ActorRef
  requested_at: Date
  reviewed_by: ActorRef | null
  reviewed_at: Date | null
  rating: number | null
  note: string | null
  changes: FieldChange[]
  // See PendingChangeSummary's own comment on why 'delete' needs this field.
  action: ChangeRequestAction
}

export interface RejectedChangeSummary {
  change_request_id: number
  section: string
  // Always REJECTED — findRejectedRequestsPaginated's query is already filtered to this status.
  // Same shape convention as PendingChangeSummary/ApprovedChangeSummary above.
  status: typeof CHANGE_REQUEST_STATUS.REJECTED
  revision: number
  requested_by: ActorRef
  requested_at: Date
  reviewed_by: ActorRef | null
  reviewed_at: Date | null
  reason: string | null
  changes: FieldChange[]
  // See PendingChangeSummary's own comment on why 'delete' needs this field.
  action: ChangeRequestAction
}

export interface ApplyChangeRequestResult {
  status: boolean
  message: { alert_message: string }
  appliedFieldCount?: number
}

export interface ChangeRequestInput {
  module: string
  target_collection: string
  target_row_id: number | null
  root_document_id: number
  section: string
  scope: 'document' | 'child'
  action: ChangeRequestAction
  payload: Record<string, unknown>
  changes: FieldChange[]
  requested_by: ActorRef
  /** Full row, for a pending delete — the only place to see what would be removed. */
  row_snapshot?: unknown
}

export interface ChangeRequestDoc {
  _id: number
  module: string
  target_collection: string
  target_row_id: number | null
  root_document_id: number
  section: string
  action: ChangeRequestAction
  payload: Record<string, unknown> | null
  changes: FieldChange[]
  revision: number
  status: ChangeRequestStatus
  requested_by: ActorRef
  requested_at: Date
  apply_started_at: Date | null
  row_snapshot: unknown | null
  rating: number | null
  note: string | null
  /**
   * Field-level approval only (see FieldChange.status's doc comment) - derived from changes[]'s
   * own per-field statuses via deriveRequestStatus (change-request.status.ts), not set directly
   * by a reviewer. Absent on every request that doesn't use field-level approval.
   */
  derived_status?: 'pending' | 'partially_completed' | 'resolved'
}

// Explicit projection — CLAUDE.md forbids `SELECT *`.
export const REQUEST_PROJECTION = {
  _id: 1,
  module: 1,
  target_collection: 1,
  target_row_id: 1,
  root_document_id: 1,
  section: 1,
  action: 1,
  payload: 1,
  changes: 1,
  revision: 1,
  status: 1,
  requested_by: 1,
  requested_at: 1,
  apply_started_at: 1,
  row_snapshot: 1,
  rating: 1,
  note: 1,
  derived_status: 1,
} as const
