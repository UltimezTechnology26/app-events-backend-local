// modules/professionals-claims/professionals-claims.types.ts

export interface AdminAuthFailure {
  status: false
  message: unknown
}

export interface AdminAuthSuccess {
  status: true
  message: {
    admin_row_id: string | number
    admin_manager_type: number
    sub_admin_type: string | number
    [key: string]: unknown
  }
}

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure
