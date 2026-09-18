// modules/company_revenue/company_revenue.categories.queries.ts
//
// CRUD data-access for Revenue Stream Categories plus the delete-guard
// usage-check filter. List/aggregation data-access lives in
// company_revenue.categories.list.queries.ts — split out purely to stay
// under the file-length limit. `company_revenue.categories.service.ts`
// orchestrates business logic and calls these instead of talking to the
// models directly.
const revenue_streamsM = require('../../../models/app/static/revenue_streams_categoryM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')

/**
 * Ports the $match stage of revenue_streams.js's GET /list handler (legacy
 * lines 15-21) verbatim: optional case-insensitive category_name search. The
 * legacy handler uses `req.query?.search?.trim()` for BOTH the truthiness
 * check and the regex value — trimmed here to match exactly (matching the
 * pattern already used in modules/funding/funding.rounds.queries.ts).
 */
export function buildRevenueStreamCategoriesListMatch({ search }: { search?: string }): Record<string, unknown> {
  const matchStage: Record<string, unknown> = {}
  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    matchStage.category_name = { $regex: trimmedSearch, $options: 'i' }
  }
  return matchStage
}

/**
 * Ports the delete guard's usage-check filter (legacy GET /delete/:category_row_id,
 * lines 239) verbatim: whether any company_revenue_growthM document has this
 * category_row_id inside its revenue_streams array.
 */
export function buildRevenueStreamUsageCheckFilter(categoryRowId: number): Record<string, unknown> {
  return { 'revenue_streams.category_row_id': categoryRowId }
}

export async function findRevenueStreamCategoryById(categoryRowId: number) {
  return revenue_streamsM.findOne({ _id: categoryRowId })
}

export async function findDuplicateRevenueStreamCategoryName(categoryRowId: number, categoryName: string) {
  return revenue_streamsM
    .findOne({ _id: { $ne: categoryRowId }, category_name: categoryName }, { _id: 1 })
    .collation({ locale: 'en', strength: 2 })
}

export async function updateRevenueStreamCategoryName(categoryRowId: number, categoryName: string) {
  return revenue_streamsM.updateOne({ _id: categoryRowId }, { $set: { category_name: categoryName } })
}

export async function insertRevenueStreamCategory(categoryName: string, dateNTime: string) {
  return new revenue_streamsM({ category_name: categoryName, active_status: true, date_n_time: dateNTime }).save()
}

export async function deleteRevenueStreamCategoryById(categoryRowId: number) {
  return revenue_streamsM.deleteOne({ _id: categoryRowId })
}

export async function findRevenueGrowthUsingCategory(categoryRowId: number) {
  return company_revenue_growthM.findOne(buildRevenueStreamUsageCheckFilter(categoryRowId))
}
