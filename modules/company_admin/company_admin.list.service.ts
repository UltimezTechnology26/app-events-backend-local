// modules/company_admin/company_admin.list.service.ts
const companyM = require('../../models/app/company/companyM')
import { buildCompanyListMatchQuery, buildCompanyListPipeline, extractCompanyListResult } from './company_admin.list.queries'

export interface GetCompanyListParams {
  activeStatus: number
  skipRaw: string
  limitRaw: string
  search?: string
  mainBusinessModelIdRaw?: string
  subAdminRowIdRaw?: string
  profileScoreRange?: string
  createdDateOnlyRaw?: string
  claimStatusRaw?: string
  categoryStatusRaw?: string
}

/**
 * Merges company.js's GET /list/:skip/:limit (approval_status:1, active_status:1) and GET
 * /disabled_list/:skip/:limit (active_status:0) into one activeStatus-parameterized handler
 * (Part 3 §7 Phase H step 4), $facet-converted per the standing list+count fix. The extra
 * filters `list` supports (main_business_model_id/sub_admin_row_id/created_date_n_time/
 * claim_status) are accepted here too but simply never sent by the disabled-list frontend page
 * — confirmed via its actual query-param usage before merging.
 */
export async function getCompanyList({
  activeStatus,
  skipRaw,
  limitRaw,
  search,
  mainBusinessModelIdRaw,
  subAdminRowIdRaw,
  profileScoreRange,
  createdDateOnlyRaw,
  claimStatusRaw,
  categoryStatusRaw,
}: GetCompanyListParams) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  let start_date = ''
  let end_date = ''
  let createdDateRange: { start_date: string; end_date: string } | undefined
  if (createdDateOnlyRaw) {
    // CONFIRMED BUG FIX (live testing, 2026-08-04): createDateOnly/createEndDateOnly parse the
    // plain "YYYY-MM-DD" input as midnight in the server's local OS timezone, then convert to a
    // hardcoded "Africa/Bamako" (UTC+0) zone — shifting the calendar day whenever the server's
    // local offset is ahead of UTC (this server: Asia/Calcutta, UTC+5:30). createEndDateOnly also
    // adds 2 extra days on top. Building the bounds directly in UTC avoids both; this was ported
    // verbatim from the real /list route (controllers/admin_panel/app/company.js) where the same
    // fix was already applied and live-confirmed.
    start_date = `${createdDateOnlyRaw}T00:00:00.000Z`
    end_date = `${createdDateOnlyRaw}T23:59:59.999Z`
    createdDateRange = { start_date, end_date }
  }

  const mainBusinessModelId = mainBusinessModelIdRaw !== undefined ? Number.parseInt(mainBusinessModelIdRaw) : undefined
  const subAdminRowId = subAdminRowIdRaw !== undefined ? Number.parseInt(subAdminRowIdRaw) : undefined
  const claimStatus = claimStatusRaw !== undefined ? Number.parseInt(claimStatusRaw) : undefined
  const categoryStatus = categoryStatusRaw !== undefined ? Number.parseInt(categoryStatusRaw) : undefined

  const matchQuery = buildCompanyListMatchQuery({ activeStatus, search, mainBusinessModelId, subAdminRowId, profileScoreRange, createdDateRange, claimStatus })
  const aggregateOutput = await companyM.aggregate(buildCompanyListPipeline({ matchQuery, categoryStatus, skip, limit }))
  const { data, count } = extractCompanyListResult(aggregateOutput)

  return { status: true, message: data, count, start_date, end_date }
}
