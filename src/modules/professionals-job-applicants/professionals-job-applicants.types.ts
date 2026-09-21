// modules/professionals-job-applicants/professionals-job-applicants.types.ts

export interface UserTokenAuthFailure {
  status: false
  message: unknown
}
export interface UserTokenAuthSuccess {
  status: true
  message: number
}
export type UserTokenAuthResult = UserTokenAuthSuccess | UserTokenAuthFailure

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

export interface AddOrUpdateApplicationBody {
  job_id: string | number
  linkedIn?: string
  salary_expectations: string | number
  highest_education: string | number
  key_skills: unknown[]
  resume?: string
  credentials?: string[]
}

export interface UpdateStatusBody {
  status: 'approved' | 'rejected' | 'scheduled' | string
  rejected_reason?: string
}
