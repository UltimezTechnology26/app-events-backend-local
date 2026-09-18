import { LifecycleAction } from './status-audit.types'

/**
 * Whitelist of auditable modules and the live collection each one owns.
 * Module names arrive from request input, so they are resolved through this map —
 * never via a dynamic model lookup, per the backend CLAUDE.md.
 */
export const AUDIT_MODULE_REGISTRY = {
  company: { collection: 'cln_company_lists' },
  event: { collection: 'cln_events' },
  professional: { collection: 'cln_professionals' },
} as const

export type AuditModule = keyof typeof AUDIT_MODULE_REGISTRY

export const isAuditModule = (value: string): value is AuditModule =>
  Object.prototype.hasOwnProperty.call(AUDIT_MODULE_REGISTRY, value)

/** Which lifecycle stamp field each action writes on cln_entity_lifecycle. */
export const ACTION_TO_LIFECYCLE_FIELD: Record<LifecycleAction, string> = {
  approve: 'last_approved',
  reject: 'last_rejected',
  enable: 'last_enabled',
  disable: 'last_disabled',
  delete: 'last_deleted',
  restore: 'last_restored',
  publish: 'last_published',
  update: 'last_updated',
}

/**
 * Which cln_change_logs.action enum value each lifecycle action records.
 * `delete` maps to 'soft_delete' because the company delete flow moves the row to
 * cln_company_deleted_history_lists rather than destroying it outright.
 */
export const ACTION_TO_LOG_ACTION: Record<LifecycleAction, string> = {
  approve: 'approve',
  reject: 'reject',
  enable: 'enable',
  disable: 'disable',
  delete: 'soft_delete',
  restore: 'restore',
  publish: 'publish',
  update: 'update',
}

export const DEFAULT_AUDIT_SECTION = 'lifecycle'
export const LIFECYCLE_COUNTER_NAME = 'cln_entity_lifecycle'

/**
 * Exported so the five company call sites never repeat the literal 'company'
 * (CLAUDE.md: no string literal duplicated 3+ times).
 */
export const AUDIT_MODULE_COMPANY: AuditModule = 'company'

export const DEFAULT_AUDIT_SKIP = 0
export const DEFAULT_AUDIT_LIMIT = 25
