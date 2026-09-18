// modules/funding/funding.investor_types.queries.ts
//
// CRUD data-access for Funding Investor Types plus the FIX #2 usage-check
// filter. List/aggregation data-access lives in
// funding.investor_types.list.queries.ts / funding.investor_types.list.counts.ts
// — split out purely to stay under the file-length limit.
const funding_investor_typesM = require('../../../models/app/static/funding_investor_typesM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')

/**
 * Ports the delete guard's usage-check filter (legacy GET /delete/:category_row_id,
 * line 347) verbatim: whether any fundingInvestmentM document references this
 * category via investor_category_row_id.
 */
export function buildFundingInvestorTypeUsageCheckFilter(categoryRowId: number): Record<string, unknown> {
  return { investor_category_row_id: categoryRowId }
}

export async function findFundingInvestorTypeById(categoryRowId: number) {
  return funding_investor_typesM.findOne({ _id: categoryRowId })
}

export async function findFundingInvestorTypeByNormalizedName(normalizedName: string) {
  return funding_investor_typesM.findOne({
    $expr: {
      $eq: [{ $toLower: '$category_name' }, normalizedName],
    },
  })
}

export async function updateFundingInvestorType(categoryRowId: number, updateObject: Record<string, unknown>) {
  return funding_investor_typesM.updateOne({ _id: categoryRowId }, { $set: updateObject })
}

export async function insertFundingInvestorType(insertObject: Record<string, unknown>) {
  return new funding_investor_typesM(insertObject).save()
}

export async function deleteFundingInvestorTypeById(categoryRowId: number) {
  return funding_investor_typesM.deleteOne({ _id: categoryRowId })
}

export async function findFundingInvestmentUsingCategory(categoryRowId: number) {
  return fundingInvestmentM.findOne(buildFundingInvestorTypeUsageCheckFilter(categoryRowId))
}
