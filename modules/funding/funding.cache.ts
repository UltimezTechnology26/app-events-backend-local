const { getCache, setCache, deleteKeysByPattern } = require('../../config/cache_helper')

/** Deduped union of every cache pattern seen across all funding write routes. */
export const FUNDING_CACHE_PATTERNS = [
  'funding_graph_*',
  'funds_raised_individual_details*',
  'company_fund_raised_overview_*',
  'funds_raised_list_*',
  'app_company_individual_other_details_*',
  'company_investment_funding_*',
  'app_user_other_details_*',
  'investor_list_*',
  'app_company_list_*',
  'investor_overview_*',
  'investment_graph_*',
  'investor_overview_with_row_id_*'
] as const

export async function invalidateFundingCaches(): Promise<void> {
  await Promise.all(FUNDING_CACHE_PATTERNS.map((pattern) => deleteKeysByPattern(pattern)))
}

export function buildFundingGraphKey(companyRowId: number, filterYears: number): string {
  return `funding_graph_${companyRowId}_${filterYears}`
}

export function buildInvestmentGraphKey(investorRowId: number, filterYears: number, investorType: number): string {
  return `investment_graph_${investorRowId}_${filterYears}_${investorType}`
}

export function buildInvestorListKey(investorType: number, investorRowId: number, skip: number, limit: number, query: Record<string, unknown>): string {
  return `investor_list_${investorType}_${investorRowId}_${skip}_${limit}_${JSON.stringify(query || {})}`
}

export function buildInvestorOverviewKey(investorType: number, investorRowId: number): string {
  return `investor_overview_${investorType}_${investorRowId}`
}

export function buildFundsRaisedOverviewKey(companyRowId: number): string {
  return `company_fund_raised_overview_${companyRowId}`
}

export function buildFundsRaisedListSelfKey(companyRowId: number, skip: number, limit: number, query: Record<string, unknown>): string {
  return `funds_raised_list_${companyRowId}_${skip}_${limit}_${JSON.stringify(query || {})}`
}

export function buildIndividualDetailsKey(roundId: number): string {
  return `funds_raised_individual_details${roundId}`
}

export function buildCompanyFundingDetailsKey(companyRowId: number, query: Record<string, unknown>): string {
  return `company_investment_funding_${companyRowId}` +
    `_investorType_${query.investor_type || 'all'}` +
    `_start_${query.start_date || 'all'}` +
    `_end_${query.end_date || 'all'}` +
    `_sort_${query.sort_order || 'default'}` +
    `_raisedType_${query.raised_investor_type || 'all'}` +
    `_category_${query.category_row_id || 'all'}` +
    `_invCategory_${query.investor_category_row_id || 'all'}` +
    `_search_${query.search ? String(query.search).trim().toLowerCase() : 'none'}`
}

export { getCache, setCache }
