// modules/company/company.categories.service.ts
//
// Business logic for the Company Categories admin CRUD, migrated from
// controllers/admin_panel/category_tags/company_business_model.js into
// modules/company/'s subfeature-file convention. The add/update handler
// lives in company.categories.upsert.service.ts and enable/disable/delete
// live in company.categories.status.service.ts — both split out purely to
// stay under the file-length limit.

import { extractPaginatedResult } from '../common/common.pagination'
import { fetchCompanyCategoriesList } from './company.categories.list.queries'
import { buildCompanyCategoriesListMatch, updateCompanyCategory, findDuplicateCompanyCategoryNameExpr } from './company.categories.queries'
import { invalidateCompanyCategoriesCaches } from './company.categories.cache'

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')

/**
 * Ports company_business_model.js's GET /list (lines 14-171). The legacy
 * handler leaked `err.message` straight to the client on failure (lines
 * 165-169) — FIX #4: that catch block is not reproduced here; any thrown
 * error propagates to the controller's catch, which returns the generic
 * "An unexpected error occurred..." message and logs server-side only.
 *
 * FIX #5 (module-wide pagination convention): optional skip/limit query
 * params are now accepted, defaulting to a full list (skip=0, effectively
 * unbounded limit) when both are omitted, matching this repo's
 * buildPaginatedFacetStages/extractPaginatedResult helper.
 */
export async function getCompanyCategoriesList({
  search,
  status,
  skipRaw,
  limitRaw,
}: {
  search?: string
  status?: string
  skipRaw?: string
  limitRaw?: string
}) {
  const skip = skipRaw !== undefined && !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = limitRaw !== undefined && !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : Number.MAX_SAFE_INTEGER

  const matchStage = buildCompanyCategoriesListMatch({ search, status })
  const aggregateOutput = await fetchCompanyCategoriesList(matchStage, skip, limit)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface UpdateCategoriesParams {
  categoryIdRaw: string
  body: Record<string, unknown>
  preValidationErrors: Record<string, string>
}

/** Ports POST /update_categories/:category_id verbatim (legacy lines 403-486). */
export async function updateCategories({ categoryIdRaw, body, preValidationErrors }: UpdateCategoriesParams) {
  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }

  const categoryId = Number.parseInt(sanitize(categoryIdRaw))
  if (!categoryId) {
    return { status: false, message: { alert_message: 'Invalid category id' } }
  }

  const businessName = (body.business_name as string).trim()
  const businessId = body.business_id ? (body.business_id as string).trim().toLowerCase() : ''

  const duplicateName = await findDuplicateCompanyCategoryNameExpr(categoryId, businessName.toLowerCase())

  if (duplicateName) {
    return { status: false, message: { business_name: 'This Business Name already exists.' } }
  }

  const updateResult = await updateCompanyCategory(categoryId, {
    business_name: businessName,
    ...(businessId && { business_id: businessId }),
    date_n_time: getPresentDateTime(),
  })

  if (updateResult.matchedCount === 0) {
    return { status: false, message: { alert_message: 'Category not found' } }
  }

  await invalidateCompanyCategoriesCaches()

  return { status: true, message: { alert_message: 'This Category has been updated successfully.' } }
}
