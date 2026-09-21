// modules/academy-admin/academy-admin.users.types.ts
// Phase 2 slice of the Academy migration (Manage Users / Manage Certificate - see plan doc).
// "Users Points" is NOT in this file's scope - that page's real backend
// (`admin_panel/app/user.js`'s `/points_list`) was already migrated in the Professionals
// migration's Phase G (`professionals-audit` module, mounted at `users_audit_v2/points_list`) -
// this Academy phase reuses that existing route as-is rather than porting it a second time.

export interface GetUsersListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  date?: string
  courseRowIdRaw?: string
}

export interface GetCertificateListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  date?: string
  courseRowIdRaw?: string
}
