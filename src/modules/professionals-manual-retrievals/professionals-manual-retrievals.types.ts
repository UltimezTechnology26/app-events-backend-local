// modules/professionals-manual-retrievals/professionals-manual-retrievals.types.ts

export interface AdminAuthFailure {
  status: false
  message: unknown
}

export interface AdminAuthSuccess {
  status: true
  message: {
    admin_row_id?: number
    admin_manager_type: number
    sub_admin_type?: number
    [key: string]: unknown
  }
}

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure

export interface ListParams {
  skipRaw: string
  limitRaw: string
  search?: string
}

export interface RejectedListParams extends ListParams {
  rejectTypeRaw?: string
}
