// modules/professionals-academy/professionals-academy.types.ts

export interface UserAuthFailure {
  status: false
  message: unknown
}

export interface UserAuthSuccess {
  status: true
  message: {
    user_row_id: number
    user_type: number
  }
}

export type UserAuthResult = UserAuthSuccess | UserAuthFailure

export interface CertificateListResult {
  status: boolean
  message: unknown
}
