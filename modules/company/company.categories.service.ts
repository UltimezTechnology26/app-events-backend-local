// modules/company/company.categories.service.ts
//
// Business logic for the Company Categories admin CRUD, migrated from
// controllers/admin_panel/category_tags/company_business_model.js into
// modules/company/'s subfeature-file convention. Only the FIRST-registered
// (reachable) POST /add_n_update_details handler (legacy lines 174-266) was
// ported — Express only ever dispatches to the first handler registered for
// a given method+path, so the second, later `router.post('/add_n_update_details', ...)`
// block (legacy lines 268-401, using $expr/$toLower duplicate checks instead
// of .collation()) is dead code and was intentionally left out.

import { extractPaginatedResult } from '../common/common.pagination'
import { buildCompanyCategoriesListMatch, buildCompanyCategoriesListPipeline } from './company.categories.queries'
import { invalidateCompanyCategoriesCaches } from './company.categories.cache'

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../utils/helpers/helper')
const company_business_modelsM = require('../../models/app/static/company_business_modelsM')

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
  const aggregateOutput = await company_business_modelsM.aggregate(
    buildCompanyCategoriesListPipeline({ matchStage, skip, limit })
  )
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface AddOrUpdateCompanyCategoryParams {
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

/**
 * Ports the reachable POST /add_n_update_details handler verbatim (legacy
 * lines 174-266): case-insensitive uniqueness checks on business_name and
 * business_id via `.collation({ locale: 'en', strength: 2 })`, then either
 * inserts a new category (no business_row_id) or updates an existing one.
 */
export async function addOrUpdateCompanyCategory({ body, preValidationErrors }: AddOrUpdateCompanyCategoryParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  let business_row_id: number | '' = ''
  if (!Number.isNaN(Number.parseInt(body.business_row_id))) {
    business_row_id = Number.parseInt(body.business_row_id)
  }

  let business_name = ''
  let business_id = ''

  if (body.business_name) {
    business_name = sanitize(body.business_name).trim()

    const duplicateName = await company_business_modelsM
      .findOne({
        _id: { $ne: business_row_id },
        business_name,
      })
      .collation({ locale: 'en', strength: 2 })

    if (duplicateName) {
      errObj['business_name'] = 'This Category Name already exists.'
    }
  }

  if (body.business_id) {
    business_id = sanitize(body.business_id).trim()

    const duplicateId = await company_business_modelsM
      .findOne({
        _id: { $ne: business_row_id },
        business_id,
      })
      .collation({ locale: 'en', strength: 2 })

    if (duplicateId) {
      errObj['business_id'] = 'This Category  ID already exists.'
    }
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const update_array: Record<string, any> = {}
  update_array['business_name'] = business_name
  // Bug fix (found via live user report, confirmed identical in the legacy
  // controller this was ported from): business_id was only ever added to
  // update_array inside the create branch below, so editing an existing
  // category's ID was silently dropped on save - it validated against
  // duplicates but never actually persisted.
  update_array['business_id'] = business_id

  if (!business_row_id) {
    update_array['date_n_time'] = getPresentDateTime()
    update_array['active_status'] = true

    await new company_business_modelsM(update_array).save()
    await invalidateCompanyCategoriesCaches()

    return { status: true, message: { alert_message: 'New Company category details has been added successfuly.' } }
  }

  const check_category = await company_business_modelsM.findOne({ _id: business_row_id })
  if (check_category) {
    await company_business_modelsM.updateOne({ _id: business_row_id }, { $set: update_array })
    await invalidateCompanyCategoriesCaches()

    return {
      status: true,
      message: { alert_message: 'This Company category details has been updated successfully.' },
      update_array,
    }
  }

  return { status: true, message: { alert_message: 'Sorry, Invalid business row id.' } }
}

export interface UpdateCategoriesParams {
  categoryIdRaw: string
  body: Record<string, any>
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

  const businessName = body.business_name.trim()
  const businessId = body.business_id ? body.business_id.trim().toLowerCase() : ''

  const duplicateName = await company_business_modelsM.findOne({
    _id: { $ne: categoryId },
    $expr: {
      $eq: [{ $toLower: '$business_name' }, businessName.toLowerCase()],
    },
  })

  if (duplicateName) {
    return { status: false, message: { business_name: 'This Business Name already exists.' } }
  }

  const updateResult = await company_business_modelsM.updateOne(
    { _id: categoryId },
    {
      $set: {
        business_name: businessName,
        ...(businessId && { business_id: businessId }),
        date_n_time: getPresentDateTime(),
      },
    }
  )

  if (updateResult.matchedCount === 0) {
    return { status: false, message: { alert_message: 'Category not found' } }
  }

  await invalidateCompanyCategoriesCaches()

  return { status: true, message: { alert_message: 'This Category has been updated successfully.' } }
}

/** Ports GET /enable/:request_row_id verbatim (legacy lines 496-527). */
export async function enableCompanyCategory({ requestRowIdRaw }: { requestRowIdRaw: string }) {
  if (Number.isNaN(Number.parseInt(requestRowIdRaw))) {
    return { status: false, message: { alert_message: 'Sorry, Invalid category row id.' } }
  }

  const request_row_id = Number.parseInt(requestRowIdRaw)

  const get_query = await company_business_modelsM.findOne({ _id: request_row_id })
  if (!get_query) {
    return { status: false, message: { alert_message: 'Sorry, Invalid category row id.' } }
  }

  await company_business_modelsM.updateOne({ _id: request_row_id }, { $set: { active_status: true } })
  const [deletedKey] = await invalidateCompanyCategoriesCaches()

  return {
    status: true,
    delted_key: deletedKey,
    message: { alert_message: 'This  Company category details has been enabled successfully.' },
  }
}

/** Ports GET /disable/:request_row_id verbatim (legacy lines 531-562). */
export async function disableCompanyCategory({ requestRowIdRaw }: { requestRowIdRaw: string }) {
  if (Number.isNaN(Number.parseInt(requestRowIdRaw))) {
    return { status: false, message: { alert_message: 'Sorry, Invalid category row id.' } }
  }

  const request_row_id = Number.parseInt(requestRowIdRaw)

  const get_query = await company_business_modelsM.findOne({ _id: request_row_id })
  if (!get_query) {
    return { status: false, message: { alert_message: 'Sorry, Invalid category row id.' } }
  }

  await company_business_modelsM.updateOne({ _id: request_row_id }, { $set: { active_status: false } })
  await invalidateCompanyCategoriesCaches()

  return { status: true, message: { alert_message: 'This Company category details has been disabled successfully.' } }
}

/** Ports GET /delete/:request_row_id verbatim (legacy lines 564-587). */
export async function deleteCompanyCategory({ requestRowIdRaw }: { requestRowIdRaw: string }) {
  const request_row_id = Number.parseInt(requestRowIdRaw)

  const checkQuery = await company_business_modelsM.findOne({ _id: request_row_id })
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Sorry, Invalid crypto category id ' } }
  }

  await company_business_modelsM.deleteOne({ _id: request_row_id })
  await invalidateCompanyCategoriesCaches()

  return { status: true, message: { alert_message: 'This Company category has been deleted successfully.' } }
}
