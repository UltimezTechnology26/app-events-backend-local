// modules/company_admin/company_admin.individual_overview.service.ts
import { getVerifiedFundingTotals } from '../funding/funding.service'
import { getCompanyRevenueSummary } from '../company_revenue/company_revenue.service'
import { getCompanyTeamMemberCounts } from '../team-members/team-members.service'

export interface GetCompanyIndividualOverviewParams {
  companyRowIdRaw: string
}

/**
 * Ports company.js's GET /company_individual_overview/:company_row_id (Part 3 §7 Phase H step
 * 5) — the per-company dashboard stat card. company_admin owns only this orchestration and
 * response shape; every underlying stat computation is delegated to its owning domain module:
 * funds-invested/raised to modules/funding/, revenue to modules/company_revenue/ (including the
 * CONFIRMED BUG FIX to last_year_revenue's missing $sort), and team-member counts to
 * modules/team-members/.
 *
 * Preserves the real source's exact (asymmetric) field-presence rule: `total_funds_invested`
 * always appears, defaulting to 0, while every other stat is omitted entirely from the response
 * when its underlying aggregate had no matching data — not something this port "cleans up".
 */
export async function getCompanyIndividualOverview({ companyRowIdRaw }: GetCompanyIndividualOverviewParams) {
  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }
  }

  const [funding, revenue, teamCounts] = await Promise.all([
    getVerifiedFundingTotals(company_row_id),
    getCompanyRevenueSummary(company_row_id),
    getCompanyTeamMemberCounts(company_row_id),
  ])

  const message = { total_funds_invested: 0, ...funding, ...revenue, ...teamCounts }

  return { status: true, message }
}
