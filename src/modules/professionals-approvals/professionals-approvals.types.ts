// modules/professionals-approvals/professionals-approvals.types.ts

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

export interface ListParams {
  approvalStatus: number
  loginStatus: number
  skipRaw: string
  limitRaw: string
  search?: string
  claimStatusRaw?: string
  subAdminRowIdRaw?: string
  profileScoreRange?: string
  designationStatusRaw?: string
  lookingForStatusRaw?: string
}
