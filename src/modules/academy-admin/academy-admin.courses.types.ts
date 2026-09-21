// modules/academy-admin/academy-admin.courses.types.ts
// Phase 1 slice of the Academy migration (courses CRUD only - see plan doc's "Phase 1" scope).

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

export interface GetCourseListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  date?: string
}

export interface SaveCourseInput {
  courseRowIdRaw?: string
  courseName?: string
  courseDescription?: string
  courseImage?: string
  expertTag?: string
  metaKeywords?: string
  metaDescription?: string
}
