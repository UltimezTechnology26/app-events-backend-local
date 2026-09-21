// modules/professionals-feedback/professionals-feedback.types.ts

export interface UserTokenAuthFailure {
  status: false
  message: string
}
export interface UserTokenAuthSuccess {
  status: true
  message: number
}
export type UserTokenAuthResult = UserTokenAuthSuccess | UserTokenAuthFailure

export interface SaveFeedbackBody {
  email_id?: string
  feedback_type: string
  message: string
  website_rating: string | number
  speed_rating: string | number
}

export interface SubmitIssueBody {
  module_type: number
  module_row_id: number
  tab_key: string
  tab_name: string
  sub_tab_key?: string | null
  option_id: number
  description?: string | null
}
