import { ActorRef } from '../status-audit/status-audit.types'
import { findPendingRequest } from './change-request.queries'

export interface PendingFieldInfo {
  old_value: unknown
  old_label: string | null
  new_value: unknown
  new_label: string | null
  requested_by: ActorRef
  requested_at: Date
}

export interface EffectiveSectionValues {
  /** What the edit form should render: live values with any pending edits applied. */
  effective_values: Record<string, unknown>
  /** Included so the UI can show old-vs-new without a second request. */
  live_values: Record<string, unknown>
  /** Per-field marker data for the fields carrying a pending edit. */
  pending_field_map: Record<string, PendingFieldInfo>
  has_pending_changes: boolean
}

/**
 * Builds the state an edit form must render: live values overlaid with the section's pending
 * change request, plus per-field marker data.
 *
 * Showing live values instead would be unsafe — a second editor's save would diff against live
 * and silently revert the first editor's pending work (design §13.1 item 5).
 */
export async function getEffectiveSectionValues({
  module,
  section,
  rootDocumentId,
  liveValues,
}: {
  module: string
  section: string
  rootDocumentId: number
  liveValues: Record<string, unknown>
}): Promise<EffectiveSectionValues> {
  const pending = await findPendingRequest({ module, rootDocumentId, section })

  const noPendingChanges: EffectiveSectionValues = {
    effective_values: liveValues,
    live_values: liveValues,
    pending_field_map: {},
    has_pending_changes: false,
  }

  // Two separate guards rather than one combined check, so TypeScript narrows `pending` to
  // non-null below without a non-null assertion (tsconfig has strict: true).
  if (!pending) {
    return noPendingChanges
  }

  const payload = pending.payload ?? {}
  if (Object.keys(payload).length === 0) {
    return noPendingChanges
  }

  const pending_field_map: Record<string, PendingFieldInfo> = {}
  for (const change of pending.changes) {
    pending_field_map[change.field] = {
      old_value: change.old_value,
      old_label: change.old_label,
      new_value: change.new_value,
      new_label: change.new_label,
      requested_by: pending.requested_by,
      requested_at: pending.requested_at,
    }
  }

  return {
    effective_values: { ...liveValues, ...payload },
    live_values: liveValues,
    pending_field_map,
    has_pending_changes: true,
  }
}
