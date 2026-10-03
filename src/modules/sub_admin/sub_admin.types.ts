// Ports controllers/admin_panel/sub_admin.js's account-CRUD request/response
// shapes verbatim - structural port only, no field renames/additions.

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
