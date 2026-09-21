// modules/professionals-meetings/professionals-meetings.admin.types.ts
// Types for the admin-panel side of this module (admin_panel/app/meetings/meetings.js) — distinct
// from the self-service side's AllAuthResult in professionals-meetings.types.ts.

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

export interface JournalistInterviewListQuery {
  search?: string
  status?: string
  start_date?: string
  end_date?: string
}

export interface AdminMeetingsListQuery {
  search?: string
  start_date?: string
  end_date?: string
  meeting_type?: string
}

export interface AdminUpdateMeetingStatusBody {
  status: 'scheduled' | 'rejected' | 'rescheduled' | string
  rejected_comment?: string
  meeting_timezone?: string
  meeting_datetime?: string
  meeting_link?: string
}
