// modules/funding/funding.rounds.service.ts
//
// Business logic for the Funding Rounds admin CRUD, migrated from
// controllers/admin_panel/category_tags/funding_rounds.js into the
// modules/funding/ module's existing convention (checkAdminLoginToken applied
// directly in the controller, buildPaginatedFacetStages/extractPaginatedResult
// for pagination — see funding.investor_types.service.ts already in this
// module).
//
// NOTE on a pre-existing legacy bug (NOT a named/approved fix for this task —
// the task plan lists no FIX # for funding_rounds): the legacy POST
// /save_n_edit handler (lines 258-292) calls `res.json({status:false,
// message:errObj})` with NO `return` when validation fails, then falls
// through into the duplicate-check and save/update logic using the
// (possibly empty/invalid) `req.body.category_name` anyway — the same bug
// class as funding_investor_types.js's FIX #1. Reproducing that fall-through
// verbatim is not mechanically possible here: this module's service
// functions return a single result to a controller that makes exactly one
// res.json call (see funding.investor_types.controller.ts), so there is no
// way to "send a response, then keep executing and try to send a second
// one" the way the legacy Express handler literally does. Faced with that
// structural mismatch, `saveOrUpdateFundingRound` returns immediately on
// validation failure — the only response actually observed by a legacy
// client anyway, since the legacy handler's later res.json call(s) after
// headers are already sent would throw. This is called out here explicitly
// because it was NOT an approved fix for this task; it is a structural
// consequence of the single-return service/controller shape used everywhere
// else in this module.

import { extractPaginatedResult } from '../common/common.pagination'
import {
  findFundingRoundById,
  findFundingRoundByNormalizedName,
  updateFundingRoundName,
  insertFundingRound,
} from './funding.rounds.queries'
import { buildFundingRoundsListMatch, fetchFundingRoundsList } from './funding.rounds.list.queries'
import { invalidateFundingRoundsCaches } from './funding.rounds.cache'
import { validateFundingRoundInput } from './funding.rounds.validation'

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')

export interface GetFundingRoundsListParams {
  search?: string
  skipRaw?: string
  limitRaw?: string
}

/**
 * Ports funding_rounds.js's GET /list (legacy lines 11-235).
 *
 * Adds optional skip/limit query params (module-wide pagination convention,
 * matching Task 10's funding.investor_types.service.ts), defaulting to a
 * full list (skip=0, unbounded limit) when both are omitted — the legacy
 * handler had no pagination at all.
 */
export async function getFundingRoundsList({ search, skipRaw, limitRaw }: GetFundingRoundsListParams) {
  const skip = skipRaw !== undefined && !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = limitRaw !== undefined && !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : Number.MAX_SAFE_INTEGER

  const matchQuery = buildFundingRoundsListMatch({ search })
  const aggregateOutput = await fetchFundingRoundsList(matchQuery, skip, limit)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface SaveOrUpdateFundingRoundParams {
  category_row_id?: string | number
  category_name?: string
}

/**
 * Ports funding_rounds.js's POST /save_n_edit (legacy lines 240-301), minus
 * the checkAdminLoginToken call (now applied in the controller before this
 * service function is invoked, matching this module's existing convention).
 *
 * See the module-level note above re: the legacy validation-error fall-through
 * bug, which is not reproduced here for structural reasons (no FIX # was
 * approved for this task).
 */
export async function saveOrUpdateFundingRound(body: SaveOrUpdateFundingRoundParams) {
  const { valid, errObj } = validateFundingRoundInput({ category_name: body.category_name })

  let category_row_id = 0
  if (body.category_row_id) {
    category_row_id = Number.parseInt(sanitize(String(body.category_row_id)))

    const checkFunding = await findFundingRoundById(category_row_id)
    if (!checkFunding) {
      errObj['category_row_id'] = 'Invalid category row id'
    }
  }

  if (!valid || Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const normalizedName = String(body.category_name).trim().toLowerCase()

  const checkExisting = await findFundingRoundByNormalizedName(normalizedName)

  if (checkExisting) {
    return { status: false, message: { category_name: 'This category is  already exists.' } }
  }

  if (category_row_id > 0) {
    await updateFundingRoundName(category_row_id, String(body.category_name).trim())
    await invalidateFundingRoundsCaches()
    return {
      status: true,
      message: { alert_message: 'This funding rounds details has been updated successfully.' },
      tokenStatus: true,
    }
  }

  await insertFundingRound(String(body.category_name).trim(), getPresentDateTime())
  await invalidateFundingRoundsCaches()
  return {
    status: true,
    message: { alert_message: 'New funding rounds details has been added successfully.' },
    tokenStatus: true,
  }
}
