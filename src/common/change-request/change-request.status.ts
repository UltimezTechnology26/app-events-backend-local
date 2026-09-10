import { FieldChange } from '../status-audit/status-audit.types'

export type DerivedRequestStatus = 'pending' | 'partially_completed' | 'resolved'

/**
 * For a document-scope update request whose changes[] carry per-field status (Basic Details/
 * SEO/Social Media - see change-request.registry.ts's fieldGroups doc comment). A missing
 * status (pre-existing data written before field-level approval shipped) is treated as pending.
 */
export function deriveRequestStatus(changes: FieldChange[]): DerivedRequestStatus {
  const statuses = changes.map((c) => c.status ?? 'pending')
  const hasPending = statuses.includes('pending')
  const hasResolved = statuses.some((s) => s === 'approved' || s === 'rejected')
  if (hasPending && hasResolved) return 'partially_completed'
  if (hasPending) return 'pending'
  return 'resolved'
}
