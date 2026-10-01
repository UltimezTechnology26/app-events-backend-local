import { recordStatusChange, buildStatusFieldChange } from '../../common/status-audit/status-audit.service'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { AUDIT_MODULE_EVENTS } from '../../common/status-audit/status-audit.registry'
import { FieldChange, LifecycleAction, UpdateTracker } from '../../common/status-audit/status-audit.types'

const ACTIVE_STATUS_FIELD = 'active_status'
const APPROVAL_STATUS_FIELD = 'approval_status'
const EVENT_TITLE_FIELD = 'event_title'
const EVENT_TITLE_LABEL = 'Event Title'

const ACTIVE_STATUS_DISABLED = 0
const ACTIVE_STATUS_ENABLED = 1

const APPROVAL_STATUS_PENDING = 0
const APPROVAL_STATUS_APPROVED = 1
const APPROVAL_STATUS_REJECTED = 2

const LABEL_ENABLED = 'Enabled'
const LABEL_DISABLED = 'Disabled'
const LABEL_PENDING = 'Pending'
const LABEL_APPROVED = 'Approved'
const LABEL_REJECTED = 'Rejected'

/**
 * CONFIRMED GAP FIX (user-requested, 2026-09-26, "event creation, approval, rejection, enable,
 * disable ... all logs are stored in the history ... for the event not the change"): none of
 * these 5 entity-level lifecycle actions on an event were ever recorded to the change-log/History
 * feed - only field-level change-request approve/reject/publish
 * (events-change-approvals.service.ts) showed up on the View page's History tab. The
 * infrastructure for this already existed and was already wired up for Professionals/Company (see
 * `professionals.audit.ts`'s own doc comment) - this file mirrors that one field-for-field,
 * swapping in the event document's own status fields: `approval_status` (0=pending/1=approved/
 * 2=rejected) for approve/reject, `active_status` (0=disabled/1=enabled) for enable/disable.
 */
/**
 * `create` has no "before" to diff against - carries a single synthetic field (the event's own
 * title) instead, same rationale as `professionals.audit.ts`/`company_admin.audit.ts`'s own
 * `statusChangeFor`.
 */
function statusChangeFor(action: LifecycleAction, eventTitle?: string | null): FieldChange[] {
  switch (action) {
    case 'create':
      return eventTitle
        ? [{ field: EVENT_TITLE_FIELD, field_label: EVENT_TITLE_LABEL, old_value: null, old_label: null, new_value: eventTitle, new_label: null }]
        : []
    case 'approve':
      return [buildStatusFieldChange(APPROVAL_STATUS_FIELD, APPROVAL_STATUS_PENDING, APPROVAL_STATUS_APPROVED, LABEL_PENDING, LABEL_APPROVED)]
    case 'reject':
      return [buildStatusFieldChange(APPROVAL_STATUS_FIELD, APPROVAL_STATUS_PENDING, APPROVAL_STATUS_REJECTED, LABEL_PENDING, LABEL_REJECTED)]
    case 'enable':
      return [buildStatusFieldChange(ACTIVE_STATUS_FIELD, ACTIVE_STATUS_DISABLED, ACTIVE_STATUS_ENABLED, LABEL_DISABLED, LABEL_ENABLED)]
    case 'disable':
      return [buildStatusFieldChange(ACTIVE_STATUS_FIELD, ACTIVE_STATUS_ENABLED, ACTIVE_STATUS_DISABLED, LABEL_ENABLED, LABEL_DISABLED)]
    default:
      return []
  }
}

export interface RecordEventStatusChangeParams {
  documentId: number
  action: LifecycleAction
  /** The getUpdateTrackerFields() result the calling service already computed (or an equivalent
   * literal for call sites whose token shape that helper doesn't recognize - see
   * `events.submit.service.ts`'s own create-path caller). */
  tracker: UpdateTracker
  /**
   * The acting admin's real row id (`admin.message.admin_row_id`). Required to keep admin
   * actions attributable - same rationale as `RecordCompanyStatusChangeParams.adminRowId`.
   */
  adminRowId?: number | string | null
  reason?: string | null
  snapshot?: unknown
  /** `create` only - see `statusChangeFor`'s own doc comment. Ignored by every other action. */
  eventTitle?: string | null
}

/**
 * Single entry point for every event lifecycle audit write (mirrors
 * `recordProfessionalStatusChange`/`recordCompanyStatusChange`), so the call block is never
 * duplicated and the module name and status labels are declared exactly once.
 */
export async function recordEventStatusChange({
  documentId,
  action,
  tracker,
  adminRowId = null,
  reason = null,
  snapshot = null,
  eventTitle = null,
}: RecordEventStatusChangeParams): Promise<void> {
  await recordStatusChange({
    module: AUDIT_MODULE_EVENTS,
    documentId,
    action,
    actor: toActorRefWithId(tracker, adminRowId),
    changes: statusChangeFor(action, eventTitle),
    reason,
    snapshot,
  })
}
