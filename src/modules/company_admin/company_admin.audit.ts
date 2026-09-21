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

const COMPANY_NAME_FIELD = 'company_name'
const COMPANY_NAME_LABEL = 'Company Name'

/**
 * The status transition each company lifecycle action represents.
 * `delete` and `restore` carry a row snapshot rather than a field diff, so they
 * produce no changes — hence the empty default. `create` has no "before" (there is no prior
 * document to diff against), so it carries a single synthetic field instead - the company's own
 * name - purely so a reviewer opening this entry's "View" dialog can tell which company it's
 * about without cross-referencing the row id, matching markets' own creation-approval entries
 * (see this app's `HistoryFeed`/`HistoryEntryCard`, which already special-case this).
 */
function statusChangeFor(action: LifecycleAction, companyName?: string | null): FieldChange[] {
  switch (action) {
    case 'create':
      return companyName ? [{ field: COMPANY_NAME_FIELD, field_label: COMPANY_NAME_LABEL, old_value: null, old_label: null, new_value: companyName, new_label: null }] : []
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
  /** `create` only - see `statusChangeFor`'s own doc comment. Ignored by every other action. */
  companyName?: string | null
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
  companyName = null,
}: RecordCompanyStatusChangeParams): Promise<void> {
  await recordStatusChange({
    module: AUDIT_MODULE_COMPANY,
    documentId,
    action,
    actor: toActorRefWithId(tracker, adminRowId),
    changes: statusChangeFor(action, companyName),
    reason,
    snapshot,
  })
}
