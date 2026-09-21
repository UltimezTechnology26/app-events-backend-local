// modules/professionals-manual-retrievals/professionals-manual-retrievals.self-service.types.ts
// Types for the self-service side of this module (controllers/app/users/manual_users.js) —
// distinct from the admin-panel side's AdminAuthResult in professionals-manual-retrievals.types.ts.

export interface UpdateManualDetailBody {
  full_name: string
  email_id?: string
  gender?: string | number
  mobile_number?: string
  user_link?: string
  company_type?: string | number
  company_row_id?: string | number
  position_row_id?: string | number
  profile_image?: string
}

export interface EditManualDetailBody {
  user_row_id: string | number
  profile_image?: string
}
