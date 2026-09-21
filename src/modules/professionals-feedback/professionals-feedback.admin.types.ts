// modules/professionals-feedback/professionals-feedback.admin.types.ts
// Types for the admin-panel side of this module (admin_panel/app/feedback.js) — distinct from the
// self-service side's UserTokenAuthResult in professionals-feedback.types.ts.

export interface AdminAuthFailure {
  status: false
  message: unknown
}
export interface AdminAuthSuccess {
  status: true
  message: {
    admin_manager_type: number
    admin_row_id?: number
    [key: string]: unknown
  }
}
export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure

export interface ReportUsersIssuesListQuery {
  module_type?: string
  search?: string
  approved_by_row_id?: string
  approved_by_type?: string
  start_date?: string
  end_date?: string
}

export interface ApproveRejectIssueBody {
  issue_row_id: number | string
  approved_status: number | string
  rejected_reason?: string
}
