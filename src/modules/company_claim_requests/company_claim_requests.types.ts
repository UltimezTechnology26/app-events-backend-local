// modules/company_claim_requests/company_claim_requests.types.ts

/** Mirrors models/app/company/company_claim_requestsM.js's saveSchema. */
export interface ClaimRequestRecord {
  _id: number
  user_row_id?: number
  company_row_id?: number
  claim_type?: number
  claim_status?: number
  claim_action_date_n_time?: Date
  claim_rejected_reason?: string
  date_n_time?: Date
}

/**
 * Shape passed to `new company_claim_requestsM(doc).save()` in addNewClaimRequest.
 * `user_row_id` is `number | string` because it ultimately comes from UserActor.message — see
 * that type's doc comment.
 */
export interface NewClaimRequestInput {
  user_row_id: number | string
  company_row_id: number
  claim_type: number
  claim_status: number
  date_n_time: Date
}

/** Projection used by saveClaimRequestDetails's professionalsM.findOne lookup. */
export interface ClaimantBasicInfo {
  _id: number
  email_id?: string
  full_name?: string
}

/** Subset of models/app/company/companyM.js's saveSchema actually read by this module. */
export interface ClaimCompanyRecord {
  _id: number
  user_row_id?: number | null
  company_name?: string
  company_id?: string
  company_email_id?: string
  website_link?: string
  approval_status?: number
  active_status?: number
  claim_status?: number
}

/** Mirrors models/app/company/company_created_by_adminM.js's saveSchema. */
export interface CompanyCreatedByAdminRecord {
  _id?: number
  company_row_id?: number
  claim_status?: number
  claim_verify_code?: string
}

/** Row shape produced by buildClaimRequestsListPipeline's final $project. */
export interface ClaimRequestsListRow {
  _id: number
  claim_type?: number
  date_n_time?: Date
  created_date_n_time?: Date
  claim_action_date_n_time?: Date
  claim_rejected_reason?: string
  company_name?: string
  company_id?: string
  company_email_id?: string
  website_link?: string
  contact_number?: string
  company_logo?: string
  user_name?: string
  approval_status?: number
  full_name?: string
  email_id?: string
  pro_batch?: string
}

/** Row shape produced by the approve/reject single-request detail aggregates. */
export interface ClaimRequestDetailRow {
  _id: number
  user_row_id?: number
  company_row_id?: number
  claim_type?: number
  date_n_time?: Date
  claim_action_date_n_time?: Date
  claim_rejected_reason?: string
  company_name?: string
  company_id?: string
  company_email_id?: string
  website_link?: string
  contact_number?: string
  company_logo?: string
  user_name?: string
  full_name?: string
  email_id?: string
}

/** Plain $match for claim_status (+ optional text search), as built by buildClaimRequestsMatchQuery. */
export type ClaimRequestsMatchQuery =
  | { claim_status: number }
  | {
      $and: [
        {
          $or: Array<
            | { company_name: { $regex: string; $options: string } }
            | { company_id: { $regex: string; $options: string } }
            | { company_email_id: { $regex: string; $options: string } }
            | { user_name: { $regex: string; $options: string } }
            | { full_name: { $regex: string; $options: string } }
            | { email_id: { $regex: string; $options: string } }
          >
        },
        { claim_status: number },
      ]
    }

/** Shape of every `buildPaginatedFacetStages`-terminated aggregation's single output document. */
export interface FacetAggregateResult<T> {
  data: T[]
  totalCount: Array<{ count: number }>
}

/**
 * The admin JWT payload shape returned as `message` by checkAdminLoginToken when
 * `status: true` (middleware/authorization.js:201-245) — a decoded token, so any claim
 * could technically be present, but these are the fields this module's admin routes
 * actually read off it.
 */
export interface AdminTokenPayload {
  admin_row_id?: number
  admin_manager_type?: number | string
  sub_admin_type?: number | string
  [key: string]: unknown
}

/**
 * Discriminated on `status`, matching checkUserLoginToken/checkAdminLoginToken/checkAllLoginToken's
 * real return shape: `status: true` always pairs with the decoded payload, `status: false` with a
 * plain string message.
 */
export type AdminActor = { status: true; message: AdminTokenPayload } | { status: false; message: string }

/**
 * checkUserLoginToken's actor shape — `message` is the logged-in user's own row id (decoded
 * straight off the JWT as `temp_row_id`, so it arrives as whatever type it was encoded with —
 * some call sites use it directly, others `Number.parseInt` it first; typed permissively here to
 * match both real usages without forcing a coercion that isn't in the real source).
 */
export type UserActor = { status: true; message: number | string } | { status: false; message: string }
