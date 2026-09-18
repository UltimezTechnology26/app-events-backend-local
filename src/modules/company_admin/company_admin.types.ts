// modules/company_admin/company_admin.types.ts

/**
 * The fields this module's admin routes actually read off the decoded admin JWT payload
 * returned as `admin.message` by checkAdminLoginToken when `status: true`
 * (middleware/authorization.js) — shared across company_admin.service.ts and
 * company_admin.approvals.service.ts instead of each declaring its own `message: any`.
 */
export interface AdminTokenMessage {
  admin_row_id: string | number
  admin_manager_type: number
  sub_admin_type: string | number
}

/** Raw checkAdminLoginToken result, used across this module's admin-gated write paths. */
export interface Actor {
  status: boolean
  message: AdminTokenMessage
}

/**
 * checkAdminLoginToken's failure shape (middleware/authorization.js:201-245) — `status: false`
 * always pairs with a plain string message. Shared by requireAdmin7/requireAdmin4 in
 * company_admin.controller.ts instead of each declaring its own `{ status: false; message: any }`.
 */
export interface AdminAuthFailure {
  status: false
  message: string
}

/** One row of POST /company_bulk_data's req.body.bulk_data array, as read by bulkImportCompanies. */
export interface BulkCompanyRow {
  company_name?: string
  main_category?: string
  about_company?: string
  company_email_id?: string
  contact_number?: string
  facebook?: string
  twitter?: string
  linkedin?: string
  instagram?: string
  video_link?: string
  telegram?: string
  medium?: string
  reddit?: string
  website_link?: string
  established_in?: string
  youtube_channel_id?: string
  describe_in_one_line?: string
  company_location?: string
  meta_title?: string
  meta_keywords?: string
  meta_description?: string
  robots_index?: string
  robots_follow?: string
  og_title?: string
  og_description?: string
  twitter_title?: string
  twitter_description?: string
  twitter_creator?: string
  other_social_links?: string
  feed_url?: string
  country_name?: string
}

/** A bulk-import row that failed validation/uniqueness, paired with the reason. */
export interface NotInsertedBulkCompanyEntry {
  message: string
  data: BulkCompanyRow
}

/** The `new companyM(insert_array).save()` payload assembled per bulk-import row. */
export interface CompanyBulkInsertFields {
  company_email_id?: string
  contact_number?: string
  main_business_model_id?: number
  business_model_id?: number[]
  country_id?: number
  company_name: string
  company_id: string
  facebook: string
  twitter: string
  linkedin: string
  instagram: string
  video_link: string
  telegram: string
  medium: string
  reddit: string
  updated_date_n_time: string
  created_date_n_time: string
  website_link: string
  established_in?: string
  youtube_channel: string
  describe_in_one_line: string
  company_location: string
  sub_admin_row_id: number
  claim_status: number
  bulk_upload_status: number
  user_row_id: number
  about_company: string
}

/** `.save()`'s resolved document — only `_id` is read off it (companyM has no exported document type). */
export interface InsertedCompanyRow {
  _id: number
}

/** getMinusYearDates()'s return shape (utils/helpers/helper.js) — a plain year-long date window. */
export interface YearDateRange {
  start_date: string
  end_date: string
}

/** computeYearsOverview()'s return shape, shared with setNewCompanyYearsOverviewCache's cached value type. */
export interface YearsOverviewResult {
  present_year: YearDateRange
  one_year: YearDateRange
  two_year: YearDateRange
  three_year: YearDateRange
  all_present_year: number
  all_one_year_back: number
  all_two_year_back: number
  all_three_year_back: number
  admin_present_year: number
  admin_one_year_back: number
  admin_two_year_back: number
  admin_three_year_back: number
  user_present_year: number
  user_one_year_back: number
  user_two_year_back: number
  user_three_year_back: number
}
