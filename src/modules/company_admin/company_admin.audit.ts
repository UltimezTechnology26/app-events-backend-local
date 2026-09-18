import { recordStatusChange, buildStatusFieldChange } from '../../common/status-audit/status-audit.service'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { AUDIT_MODULE_COMPANY } from '../../common/status-audit/status-audit.registry'
import { FieldChange, LifecycleAction, UpdateTracker } from '../../common/status-audit/status-audit.types'

const APPROVAL_STATUS_FIELD = 'approval_status'
const ACTIVE_STATUS_FIELD = 'active_status'

const APPROVAL_STATUS_PENDING = 0
const APPROVAL_STATUS_APPROVED = 1
const APPROVAL_STATUS_REJECTED = 2

const ACTIVE_STATUS_DISABLED = 0
const ACTIVE_STATUS_ENABLED = 1

const LABEL_PENDING = 'Pending'
const LABEL_APPROVED = 'Approved'
const LABEL_REJECTED = 'Rejected'
const LABEL_ENABLED = 'Enabled'
const LABEL_DISABLED = 'Disabled'

/**
 * The status transition each company lifecycle action represents.
 * `delete` and `restore` carry a row snapshot rather than a field diff, so they
 * produce no changes — hence the empty default.
 */
function statusChangeFor(action: LifecycleAction): FieldChange[] {
  switch (action) {
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

export interface RecordCompanyStatusChangeParams {
  documentId: number
  action: LifecycleAction
  /** The getUpdateTrackerFields() result the calling service already computed. */
  tracker: UpdateTracker
  /**
   * The acting admin's real row id (`admin.message.admin_row_id`). Required to keep
   * admin actions attributable: getUpdateTrackerFields() reports a full admin as
   * `updated_by_row_id: 0` and discards admin_row_id, which would make every admin
   * approval and publish indistinguishable from every other admin's.
   */
  adminRowId?: number | string | null
  reason?: string | null
  snapshot?: unknown
}

/**
 * Single entry point for every company lifecycle audit write, so the call block is
 * never duplicated across the approvals and admin services and the module name and
 * status labels are declared exactly once.
 */
export async function recordCompanyStatusChange({
  documentId,
  action,
  tracker,
  adminRowId = null,
  reason = null,
  snapshot = null,
}: RecordCompanyStatusChangeParams): Promise<void> {
  await recordStatusChange({
    module: AUDIT_MODULE_COMPANY,
    documentId,
    action,
    actor: toActorRefWithId(tracker, adminRowId),
    changes: statusChangeFor(action),
    reason,
    snapshot,
  })
}
