// modules/company/company.categories.queries.ts
//
// CRUD data-access for Company Categories. List/aggregation data-access
// lives in company.categories.list.queries.ts — split out purely to stay
// under the file-length limit. `company.categories.service.ts` orchestrates
// business logic and calls these instead of talking to the model directly.
const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')

/**
 * Ports the $match stage of company_business_model.js's GET /list handler
 * (lines 19-35) verbatim: optional case-insensitive business_name search plus
 * an optional active_status filter derived from ?status=0/1.
 */
export function buildCompanyCategoriesListMatch({
  search,
  status,
}: {
  search?: string
  status?: string
}): Record<string, unknown> {
  const filter_array: Record<string, unknown>[] = []

  if (search) {
    filter_array.push({
      business_name: { $regex: search, $options: 'i' },
    })
  }

  if (status !== undefined && status !== '') {
    if (status === '1') {
      filter_array.push({ active_status: true })
    } else if (status === '0') {
      filter_array.push({ active_status: false })
    }
  }

  return filter_array.length > 0 ? { $and: filter_array } : {}
}

export async function findDuplicateCompanyCategoryName(businessRowId: number | '', businessName: string) {
  return company_business_modelsM
    .findOne({ _id: { $ne: businessRowId }, business_name: businessName })
    .collation({ locale: 'en', strength: 2 })
}

export async function findDuplicateCompanyCategoryBusinessId(businessRowId: number | '', businessId: string) {
  return company_business_modelsM
    .findOne({ _id: { $ne: businessRowId }, business_id: businessId })
    .collation({ locale: 'en', strength: 2 })
}

export async function findCompanyCategoryById(categoryRowId: number | string) {
  return company_business_modelsM.findOne({ _id: categoryRowId })
}

export async function insertCompanyCategory(insertFields: Record<string, unknown>) {
  return new company_business_modelsM(insertFields).save()
}

export async function updateCompanyCategory(categoryRowId: number | string, updateFields: Record<string, unknown>) {
  return company_business_modelsM.updateOne({ _id: categoryRowId }, { $set: updateFields })
}

export async function findDuplicateCompanyCategoryNameExpr(categoryId: number, normalizedNameLower: string) {
  return company_business_modelsM.findOne({
    _id: { $ne: categoryId },
    $expr: {
      $eq: [{ $toLower: '$business_name' }, normalizedNameLower],
    },
  })
}

export async function deleteCompanyCategoryById(categoryRowId: number) {
  return company_business_modelsM.deleteOne({ _id: categoryRowId })
}
