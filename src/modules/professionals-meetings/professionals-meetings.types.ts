// modules/professionals-meetings/professionals-meetings.types.ts

export interface AllAuthFailure {
  status: false
  message: unknown
}
export interface AllAuthSuccess {
  status: true
  message: {
    user_row_id: number
    user_type: number
  }
}
export type AllAuthResult = AllAuthSuccess | AllAuthFailure

export interface ScheduleJobInterviewBody {
  job_role: string
  company_row_id: string | number
  meeting_datetime: string
  meeting_timezone: string
  meeting_link: string
  upload_document?: string
}

export interface Schedule1on1Body {
  meeting_datetime: string
  meeting_title: string
  meeting_timezone: string
  meeting_link: string
  professional_id: string | number
}

export interface ScheduleJournalistInterviewBody {
  meeting_datetime: string
  meeting_title: string
  meeting_timezone: string
  meeting_link: string
  upload_document?: string
}

export interface ScheduleBusinessMeetingBody {
  meeting_datetime: string
  meeting_title: string
  meeting_timezone: string
  meeting_link: string
  professional_ids?: (string | number)[]
  company_ids?: (string | number)[]
  company_row_id?: string | number
}

export interface UpdateMeetingStatusBody {
  status: 'scheduled' | 'rejected' | 'rescheduled' | string
  rejected_comment?: string
  meeting_timezone?: string
  meeting_datetime?: string
}
