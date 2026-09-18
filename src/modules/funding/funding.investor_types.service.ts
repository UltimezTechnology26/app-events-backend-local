// modules/funding/funding.investor_types.service.ts
//
// Business logic for the Funding Investor Types admin CRUD, migrated from
// controllers/admin_panel/category_tags/funding_investor_types.js into the
// modules/funding/ module's existing convention (checkAdminLoginToken applied
// directly in the controller, buildPaginatedFacetStages/extractPaginatedResult
// for pagination — see funding.controller.ts / funding.service.ts already in
// this module, and the analogous modules/company_revenue/company_revenue.categories.*.ts
// port).
//
// FIX #1 (structural): the legacy handler's validation-error branch did
// `res.json({status:false, message:errObj})` with NO `return`, so execution
// fell through into the duplicate-check + save/update logic even after
// already responding once. Here, `saveOrUpdateFundingInvestorType` `return`s
// immediately on validation failure (see below), and the controller
// (funding.investor_types.controller.ts) makes exactly one `res.json`/`return`
// call per handler — the bug class structurally cannot recur.

import { extractPaginatedResult } from '../common/common.pagination'
import {
  findFundingInvestorTypeById,
  findFundingInvestorTypeByNormalizedName,
  updateFundingInvestorType,
  insertFundingInvestorType,
  deleteFundingInvestorTypeById,
  findFundingInvestmentUsingCategory,
} from './funding.investor_types.queries'
import { buildFundingInvestorTypesListMatch, fetchFundingInvestorTypesList } from './funding.investor_types.list.queries'
import { invalidateFundingInvestorTypesCaches } from './funding.investor_types.cache'
import { validateFundingInvestorTypeInput } from './funding.investor_types.validation'

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')

export interface GetFundingInvestorTypesListParams {
  search?: string
  investorTypeRaw?: string
  skipRaw?: string
  limitRaw?: string
}

/**
 * Ports funding_investor_types.js's GET /list (legacy lines 11-254). FIX #5
 * (module-wide pagination convention): optional skip/limit query params are
 * now accepted, defaulting to a full list (skip=0, unbounded limit) when both
 * are omitted — the legacy handler had no pagination at all.
 */
export async function getFundingInvestorTypesList({ search, investorTypeRaw, skipRaw, limitRaw }: GetFundingInvestorTypesListParams) {
  const skip = skipRaw !== undefined && !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = limitRaw !== undefined && !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : Number.MAX_SAFE_INTEGER
  const investorType = investorTypeRaw !== undefined ? Number.parseInt(investorTypeRaw) : undefined

  const matchQuery = buildFundingInvestorTypesListMatch({ search, investorType })
  const aggregateOutput = await fetchFundingInvestorTypesList(matchQuery, skip, limit)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface SaveOrUpdateFundingInvestorTypeParams {
  category_row_id?: string | number
  category_name?: string
  investor_type?: string | number
}

/**
 * Ports funding_investor_types.js's POST /save_n_edit (legacy lines 263-337),
 * minus the checkAdminLoginToken call (now applied in the controller before
 * this service function is invoked, matching this module's / modules/company_revenue's
 * existing convention), WITH FIX #1: the validation-error branch now `return`s
 * immediately instead of falling through into the duplicate-check/save logic.
 */
export async function saveOrUpdateFundingInvestorType(body: SaveOrUpdateFundingInvestorTypeParams) {
  const investorTypeNum = body.investor_type !== undefined ? Number.parseInt(String(body.investor_type)) : undefined
  const { valid, errObj } = validateFundingInvestorTypeInput({
    category_name: body.category_name,
    investor_type: investorTypeNum,
  })

  let category_row_id = 0
  if (body.category_row_id) {
    category_row_id = Number.parseInt(sanitize(String(body.category_row_id)))

    const checkFunding = await findFundingInvestorTypeById(category_row_id)
    if (!checkFunding) {
      errObj['category_row_id'] = 'Invalid funding investor type row id'
    }
  }

  // FIX #1: return immediately on validation failure, instead of the legacy
  // handler's fall-through (res.json without return) that let a rejected
  // payload still reach the duplicate-check/save logic below.
  if (!valid || Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const normalizedName = String(body.category_name).trim().toLowerCase()

  const checkExisting = await findFundingInvestorTypeByNormalizedName(normalizedName)

  if (checkExisting) {
    return { status: false, message: { category_name: 'This category is already exists.' } }
  }

  const update_object: Record<string, unknown> = {}
  update_object['investor_type'] = investorTypeNum
  update_object['category_name'] = String(body.category_name).trim()

  if (category_row_id) {
    await updateFundingInvestorType(category_row_id, update_object)
    await invalidateFundingInvestorTypesCaches()
    return { status: true, message: { alert_message: 'This funding investor type details has been updated successfully.' } }
  }

  update_object['date_n_time'] = getPresentDateTime()
  await insertFundingInvestorType(update_object)
  await invalidateFundingInvestorTypesCaches()
  return { status: true, message: { alert_message: 'New funding investor type details has been added successfully.' } }
}

/**
 * Ports funding_investor_types.js's GET /delete/:category_row_id verbatim
 * (legacy lines 339-370), minus the checkAdminLoginToken call (now applied in
 * the controller).
 *
 * The usage guard against fundingInvestmentM (checking investor_category_row_id)
 * ALREADY EXISTS in the legacy handler (confirmed in Step 1, legacy line 347) —
 * this is a faithful port of pre-existing behavior, not a newly added check.
 */
export async function deleteFundingInvestorType(categoryRowIdRaw: string) {
  const category_row_id = Number.parseInt(categoryRowIdRaw)

  const checkQuery = await findFundingInvestorTypeById(category_row_id)
  if (!checkQuery) {
    return { status: false, message: { alert_message: 'Sorry, Invalid funding investor type round id ' } }
  }

  const checkCategoryPresent = await findFundingInvestmentUsingCategory(category_row_id)
  if (checkCategoryPresent) {
    return { status: false, message: { alert_message: 'Sorry, funding investor type in use, cannot delete.' } }
  }

  await deleteFundingInvestorTypeById(category_row_id)
  await invalidateFundingInvestorTypesCaches()
  return { status: true, message: { alert_message: 'This funding investor type details has been deleted successfully.' } }
}
