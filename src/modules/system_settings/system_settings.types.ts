// modules/system_settings/system_settings.types.ts
//
// Shared across all 5 system-settings category files. `Actor` types the
// raw checkAdminLoginToken() return value passed down from each category's
// controller into its service — see any category's service.ts file header
// for the actor-pattern convention this repo already uses.

export interface Actor {
  status: boolean
  message: unknown
}
