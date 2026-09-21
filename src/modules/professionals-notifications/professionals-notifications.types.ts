// modules/professionals-notifications/professionals-notifications.types.ts

export interface AdminAuthFailure {
  status: false
  message: unknown
}
export interface AdminAuthSuccess {
  status: true
  message: unknown
}
export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure
