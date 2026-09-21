// modules/professionals-followers/professionals-followers.types.ts

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

export interface AdminAuthFailure {
  status: false
  message: unknown
}

export interface AdminAuthSuccess {
  status: true
  message: unknown
}

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure
