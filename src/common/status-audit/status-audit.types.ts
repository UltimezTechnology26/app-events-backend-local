export type ActorType = 'admin' | 'subadmin' | 'user' | 'system'

export interface ActorRef {
  type: ActorType | null
  id: number | null
  /**
   * Resolved display name (e.g. a sub-admin's `full_name`) - never stored, only attached when a
   * read path calls `resolveActorName` (status-audit.actor.ts) to enrich a reviewer-facing
   * summary. Absent everywhere else, including on the stored DB document itself.
   */
  name?: string | null
}

/** The lifecycle transitions this service records. */
export type LifecycleAction =
  | 'approve'
  | 'reject'
  | 'enable'
  | 'disable'
  | 'delete'
  | 'restore'
  | 'publish'
  | 'update'

/** One field-level difference. Generic: adding a schema field needs no change here. */
export interface FieldChange {
  field: string
  /** Human-readable name for `field` (e.g. "Name" for `user_row_id`) - absent falls back to the raw field key. */
  field_label?: string | null
  old_value: unknown
  old_label: string | null
  new_value: unknown
  new_label: string | null
  /**
   * Who last touched THIS field, when a pending request has been amended by more than one
   * submitter — each field keeps its own author across amendments (see
   * change-request.service.ts's mergeFieldChanges). Absent on requests logged before this field
   * existed; callers fall back to the request's own `requested_by`.
   */
  changed_by?: ActorRef | null
}

/** Shape returned by getUpdateTrackerFields() in the shared library's auth category. */
export interface UpdateTracker {
  updated_by: string | null
  updated_by_row_id: number | string | null
}

export interface LifecycleStamp {
  by: ActorRef
  at: Date
  reason: string | null
}

export interface RecordStatusChangeParams {
  module: string
  documentId: number
  action: LifecycleAction
  actor: ActorRef
  /** The status transition itself, e.g. approval_status 0 -> 1. */
  changes?: FieldChange[]
  reason?: string | null
  /** Full row, for deletes — the only surviving record once the row is gone. */
  snapshot?: unknown
  /** Defaults to 'lifecycle'. */
  section?: string
}

export interface EntityAuditHistoryParams {
  module: string
  documentId: number
  skip: number
  limit: number
}
