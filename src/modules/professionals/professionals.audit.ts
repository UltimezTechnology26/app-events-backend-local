import { recordStatusChange, buildStatusFieldChange } from '../../common/status-audit/status-audit.service'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { FieldChange, LifecycleAction, UpdateTracker } from '../../common/status-audit/status-audit.types'

const LOGIN_STATUS_FIELD = 'login_status'
const APPROVAL_STATUS_FIELD = 'approval_status'
const FULL_NAME_FIELD = 'full_name'
const FULL_NAME_LABEL = 'Full Name'

const LOGIN_STATUS_DISABLED = 0
const LOGIN_STATUS_ENABLED = 1

const APPROVAL_STATUS_PENDING = 0
const APPROVAL_STATUS_APPROVED = 1
const APPROVAL_STATUS_REJECTED = 2

const LABEL_ENABLED = 'Enabled'
const LABEL_DISABLED = 'Disabled'
const LABEL_PENDING = 'Pending'
const LABEL_APPROVED = 'Approved'
const LABEL_REJECTED = 'Rejected'

/**
 * CONFIRMED BUG FIX: enableUser/disableUser never recorded anything to the change-log/History
 * feed at all — every other lifecycle action on a professional (change-request submit/approve/
 * reject/publish) already shows up in the View page's History tab, but Enable/Disable were
 * silent, confirmed live during Professionals-migration QA (disabling a professional produced no
 * new entry in History whatsoever). The infrastructure for this already existed and was already
 * wired up on the Company side (see `company_admin.audit.ts`'s `recordCompanyStatusChange`,
 * built against the exact same `recordStatusChange`/`ACTION_TO_LIFECYCLE_FIELD`/
 * `ACTION_TO_LOG_ACTION` registry, which already declares 'enable'/'disable' entries) — this file
 * mirrors that one field-for-field, swapping Company's `active_status` for the professional
 * document's own status field, `login_status` (same 0=disabled/1=enabled convention).
 */
/**
 * `create` has no "before" to diff against - carries a single synthetic field (the professional's
 * own full name) instead, same rationale as `company_admin.audit.ts`'s own `statusChangeFor`.
 * `approve`/`reject` mirror Company's own `approval_status` transition exactly (self-register
 * approvals - previously unaudited entirely, see `recordProfessionalStatusChange`'s new callers
 * in `professionals-approvals.service.ts`).
 */
function statusChangeFor(action: LifecycleAction, fullName?: string | null): FieldChange[] {
  switch (action) {
    case 'create':
      return fullName ? [{ field: FULL_NAME_FIELD, field_label: FULL_NAME_LABEL, old_value: null, old_label: null, new_value: fullName, new_label: null }] : []
    case 'approve':
      return [buildStatusFieldChange(APPROVAL_STATUS_FIELD, APPROVAL_STATUS_PENDING, APPROVAL_STATUS_APPROVED, LABEL_PENDING, LABEL_APPROVED)]
    case 'reject':
      return [buildStatusFieldChange(APPROVAL_STATUS_FIELD, APPROVAL_STATUS_PENDING, APPROVAL_STATUS_REJECTED, LABEL_PENDING, LABEL_REJECTED)]
    case 'enable':
      return [buildStatusFieldChange(LOGIN_STATUS_FIELD, LOGIN_STATUS_DISABLED, LOGIN_STATUS_ENABLED, LABEL_DISABLED, LABEL_ENABLED)]
    case 'disable':
      return [buildStatusFieldChange(LOGIN_STATUS_FIELD, LOGIN_STATUS_ENABLED, LOGIN_STATUS_DISABLED, LABEL_ENABLED, LABEL_DISABLED)]
    default:
      return []
  }
}

export interface RecordProfessionalStatusChangeParams {
  documentId: number
  action: LifecycleAction
  /** The getUpdateTrackerFields() result the calling service already computed. */
  tracker: UpdateTracker
  /**
   * The acting admin's real row id (`admin.message.admin_row_id`). Required to keep admin
   * actions attributable — same rationale as `RecordCompanyStatusChangeParams.adminRowId`.
   */
  adminRowId?: number | string | null
  reason?: string | null
  snapshot?: unknown
  /** `create` only - see `statusChangeFor`'s own doc comment. Ignored by every other action. */
  fullName?: string | null
}

/**
 * Single entry point for every professional lifecycle audit write (mirrors
 * `recordCompanyStatusChange`), so the call block is never duplicated and the module name and
 * status labels are declared exactly once.
 */
export async function recordProfessionalStatusChange({
  documentId,
  action,
  tracker,
  adminRowId = null,
  reason = null,
  snapshot = null,
  fullName = null,
}: RecordProfessionalStatusChangeParams): Promise<void> {
  await recordStatusChange({
    module: AUDIT_MODULE_PROFESSIONALS,
    documentId,
    action,
    actor: toActorRefWithId(tracker, adminRowId),
    changes: statusChangeFor(action, fullName),
    reason,
    snapshot,
  })
}
