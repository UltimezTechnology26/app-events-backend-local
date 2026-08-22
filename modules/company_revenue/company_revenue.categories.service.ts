// modules/company_revenue/company_revenue.categories.service.ts
//
// Business logic for the Revenue Stream Categories admin CRUD, migrated from
// controllers/admin_panel/category_tags/revenue_streams.js into
// modules/company_revenue/'s existing convention (checkAdminLoginToken applied
// directly in the controller, subfeature-file split, buildPaginatedFacetStages/
// extractPaginatedResult for pagination — see company_revenue.controller.ts /
// company_revenue.service.ts already in this module).
//
// NOTE (confirmed in Step 1): models/app/static/revenue_streams_categoryM.js has
// no `active_status` field at all, unlike most sibling category models — and the
// legacy controller has no enable/disable route to match. None is ported here;
// this is not an omission.

import { extractPaginatedResult } from '../common/common.pagination'
import {
  buildRevenueStreamCategoriesListMatch,
  buildRevenueStreamCategoriesListPipeline,
  buildRevenueStreamUsageCheckFilter,
} from './company_revenue.categories.queries'
import { invalidateRevenueStreamCategoriesCaches } from './company_revenue.categories.cache'

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../utils/helpers/helper')
const revenue_streamsM = require('../../models/app/static/revenue_streams_categoryM')
const company_revenue_growthM = require('../../models/app/company/company_revenue_growthM')

export interface GetRevenueStreamCategoriesListParams {
  search?: string
  skipRaw?: string
  limitRaw?: string
}

/**
 * Ports revenue_streams.js's GET /list (legacy lines 13-164). FIX #5
 * (module-wide pagination convention): optional skip/limit query params are
 * now accepted, defaulting to a full list (skip=0, unbounded limit) when both
 * are omitted — the legacy handler had no pagination at all.
 */
export async function getRevenueStreamCategoriesList({ search, skipRaw, limitRaw }: GetRevenueStreamCategoriesListParams) {
  const skip = skipRaw !== undefined && !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = limitRaw !== undefined && !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : Number.MAX_SAFE_INTEGER

  const matchStage = buildRevenueStreamCategoriesListMatch({ search })
  const aggregateOutput = await revenue_streamsM.aggregate(
    buildRevenueStreamCategoriesListPipeline({ matchStage, skip, limit })
  )
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface SaveNEditRevenueStreamCategoryParams {
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

/**
 * Ports revenue_streams.js's POST /save_n_edit verbatim (legacy lines
 * 168-229), minus the checkAdminLoginToken call (now applied in the
 * controller before this service function is invoked, matching this
 * module's / modules/company/company.categories.*.ts's existing convention).
 */
export async function saveNEditRevenueStreamCategory({ body, preValidationErrors }: SaveNEditRevenueStreamCategoryParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let category_row_id = 0
  if (body.category_row_id) {
    category_row_id = Number.parseInt(sanitize(body.category_row_id))

    const checkFunding = await revenue_streamsM.findOne({ _id: category_row_id })
    if (!checkFunding) {
      errObj['category_row_id'] = 'Invalid category row id'
    }
  }

  let category_name = ''
  if (body.category_name) {
    category_name = sanitize(body.category_name)

    const duplicateQuery = await revenue_streamsM
      .findOne(
        {
          _id: { $ne: category_row_id },
          category_name: category_name,
        },
        { _id: 1 }
      )
      .collation({ locale: 'en', strength: 2 })

    if (duplicateQuery) {
      errObj['category_name'] = 'Sorry, This revenue stream name already exists.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  if (category_row_id) {
    await revenue_streamsM.updateOne({ _id: category_row_id }, { $set: { category_name: category_name } })
    await invalidateRevenueStreamCategoriesCaches()
    return { status: true, message: { alert_message: 'This revenue stream details has been updated successfully.' } }
  }

  await new revenue_streamsM({ category_name: category_name, active_status: true, date_n_time: getPresentDateTime() }).save()
  await invalidateRevenueStreamCategoriesCaches()
  return { status: true, message: { alert_message: 'New revenue stream details has been added successfully.' } }
}

/**
 * Ports revenue_streams.js's GET /delete/:category_row_id verbatim (legacy
 * lines 231-262), minus the checkAdminLoginToken call (now applied in the
 * controller).
 *
 * FIX #2: the usage guard against company_revenue_growthM (checking
 * revenue_streams.category_row_id inside its nested array) ALREADY EXISTS in
 * the legacy handler (confirmed in Step 1, legacy line 239) — this is a
 * faithful port of pre-existing behavior, not a newly added check.
 */
export async function deleteRevenueStreamCategory(categoryRowIdRaw: string) {
  const category_row_id = Number.parseInt(categoryRowIdRaw)

  const checkQuery = await revenue_streamsM.findOne({ _id: category_row_id })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Sorry, Invalid revenue stream round id ' } }
  }

  const usageFilter = buildRevenueStreamUsageCheckFilter(category_row_id)
  const checkCategoryPresent = await company_revenue_growthM.findOne(usageFilter)
  if (checkCategoryPresent) {
    return { status: false, message: { alert_message: 'Sorry, revenue stream in use, cannot delete.' } }
  }

  await revenue_streamsM.deleteOne({ _id: category_row_id })
  await invalidateRevenueStreamCategoriesCaches()
  return { status: true, message: { alert_message: 'This revenue stream details has been deleted successfully.' } }
}
