// modules/professionals-account-settings/professionals-account-settings.types.ts

export interface UserTokenFailure {
  status: false
  message: unknown
}

export interface UserTokenSuccess {
  status: true
  message: number
}

export type UserTokenResult = UserTokenSuccess | UserTokenFailure
