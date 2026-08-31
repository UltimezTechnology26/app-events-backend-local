// modules/company_manual/company_manual.types.ts

/** Mirrors models/app/company/company_manual_retrievalsM.js's saveSchema. */
export interface ManualCompanyRecord {
  _id: number
  created_from_type?: number
  company_name?: string
  company_email_id?: string
  company_logo?: string
  website_link?: string
  medium?: string
  twitter?: string
  reddit?: string
  feed_url?: string
  main_business_model_id?: number
  used_counts?: number
  used_types?: Record<string, unknown>
  created_on?: Date
  updated_on?: Date
  approval_status?: number
  approval_date?: Date
  approval_sub_admin_row_id?: number
  main_company_row_id?: number
  reject_type?: number
  reject_reason?: string
}

/** Shape passed to `new company_manual_retrievalsM(doc).save()` in addManualCompanyDetails. */
export interface NewManualCompanyInput {
  company_name: string
  company_email_id: string
  company_logo: string
  created_from_type: number
  website_link: string
  used_counts: number
  created_on: Date
  updated_on: Date
}

/** Projection used by the real-company uniqueness lookups (companyM.findOne(...).collation(...)). */
export interface CompanyIdOnly {
  _id: number
}

/**
 * Shared shape for the funding/sponsor-partner/work-experience "does a related record exist"
 * findOne lookups in deleteManualCompany — every call site only checks the result for truthiness,
 * never reads a field off it.
 */
export interface ExistenceCheckRow {
  _id: number
}

export interface PendingManualCompanyListRow {
  _id: number
  company_name?: string
  company_email_id?: string
  company_logo?: string
  website_link?: string
  used_counts?: number
  used_types?: Record<string, unknown>
  created_on?: Date
  created_from_type?: number
  updated_on?: Date
}

export interface RejectedManualCompanyListRow extends PendingManualCompanyListRow {
  approval_status?: number
  approval_date?: Date
  approval_sub_admin_row_id?: number
  reject_type?: number
  reject_reason?: string
  subadmin_name?: string
}

export interface ApprovedManualCompanyListRow extends RejectedManualCompanyListRow {
  main_company_row_id?: number
  main_company_name?: string
  main_company_id?: string
  main_company_active_status?: number
}

export interface ManualCompanyIndividualDetailRow {
  _id: number
  company_name?: string
  company_email_id?: string
  company_logo?: string
  website_link?: string
  used_counts?: number
  used_types?: Record<string, unknown>
  created_on?: Date
  updated_on?: Date
  approval_status?: number
  approval_date?: Date
  approval_sub_admin_row_id?: number
  reject_type?: number
  reject_reason?: string
  subadmin_name?: string
  fund_raised_count?: number
  fund_invested_count?: number
  team_members_count?: number
}

export interface ManualCompanyEmployeeListRow {
  _id: number
  user_account_type?: number
  user_row_id?: number
  position_row_id?: number
  position_name?: string
  user_name?: string
  full_name?: string
  email_id?: string
  profile_image?: string
  user_approval_status?: number
  verified_status?: number
  verified_on?: Date
  employment_type?: number
  location_type?: number
  start_date?: Date
  responsibilities?: string
}

export interface ManualCompanySponsorPartnerListRow {
  _id: number
  event_row_id?: number
  event_title?: string
  event_image?: string
  event_url?: string
  start_date?: Date
  end_date?: Date
  sponsorship_type_title?: string
  requested_status?: number
  created_date_n_time?: Date
}

/** Shape of every `buildPaginatedFacetStages`-terminated aggregation's single output document. */
export interface FacetAggregateResult<T> {
  data: T[]
  totalCount: Array<{ count: number }>
}

/** req.body shape for POST /app/company/manual_company/update_manual_detail. */
export interface AddManualCompanyDetailsBody {
  company_name?: string
  company_email_id?: string
  website_link?: string
  company_logo?: string
  created_from_type?: string | number
}

/** req.body shape for POST /app/company/manual_company/edit_manual_detail. */
export interface EditManualCompanyLogoBody {
  company_row_id?: string | number
  company_logo?: string
}

/** req.body shape for POST /admin_panel/.../reject_manual_company/:company_row_id. */
export interface RejectManualCompanyBody {
  reject_type?: number
  reject_reason?: string
}

/**
 * The admin JWT payload shape returned as `message` by checkAdminLoginToken when
 * `status: true` (middleware/authorization.js:201-245) — a decoded token, so any claim
 * could technically be present, but these are the fields this module's admin routes
 * actually read off it.
 */
export interface AdminTokenPayload {
  admin_manager_type?: number | string
  admin_row_id?: number
  sub_admin_type?: number | string
  admin_access_types?: number[]
  [key: string]: unknown
}

/**
 * Discriminated on `status`: checkAdminLoginToken always pairs `status: true` with the
 * decoded token payload, and `status: false` with a plain string message — never mixed.
 * Written as a union (not `{ status: boolean; message: any }`) so `if (!actor.status)
 * return actor` narrows `actor.message` to `AdminTokenPayload` for every call site below it.
 */
export type AdminActor = { status: true; message: AdminTokenPayload } | { status: false; message: string }
