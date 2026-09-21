// modules/professionals/professionals.types.ts
// Shared request/response/domain types for the professionals module (Phase A slice).

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

export interface GetProfessionalListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  claimStatusRaw?: string
  loginStatusRaw?: string
  approvalStatusRaw?: string
  subAdminRowIdRaw?: string
  profileScoreRange?: string
  designationStatusRaw?: string
  lookingForStatusRaw?: string
  sortByRaw?: string
}

export interface GetAdminCreatedListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  profileScoreRange?: string
}

export interface YearsOverviewResult {
  status: true
  message: Record<string, unknown>
}
