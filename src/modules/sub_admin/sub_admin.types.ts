// Ports controllers/admin_panel/sub_admin.js's account-CRUD request/response
// shapes verbatim - structural port only, no field renames/additions.

/** `sub_admin_type` values (1 = Marketing Restricted, 2 = Developer Team, 3 = Marketing Full). */
export const SUB_ADMIN_TYPE = {
  MARKETING_RESTRICTED: 1,
  DEVELOPER: 2,
  MARKETING_FULL: 3,
} as const

/**
 * Developer Team is retired (2026-10-06): no new sub-admin may be given it.
 * Existing Developer accounts keep the type (and their record-level
 * restrictions) until disabled, so an edit may keep 2 but never switch to it.
 */
export const RETIRED_SUB_ADMIN_TYPES: readonly number[] = [SUB_ADMIN_TYPE.DEVELOPER]

export interface CheckTokenResult {
  status: boolean
  message?: string
}

export interface CreateOrUpdateSubAdminBody {
  full_name?: string
  email_id?: string
  mobile_number?: string
  password?: string
  create_type_row_id?: unknown
  sub_admin_type?: string | number
}

export interface DisableSubAdminBody {
  reason_for_disable?: string
}

export interface UpdateSubAdminPasswordBody {
  new_password?: string
}

export interface ServiceResponse {
  status: boolean
  message: Record<string, unknown> | string | unknown[]
  countQueryRun?: number
}
