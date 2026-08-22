// modules/work-experience/work-experience.positions.service.ts
//
// Ports controllers/admin_panel/category_tags/positions.js verbatim
// (GET /list, POST /update_position_details, GET /enable_position/:id,
// GET /disable_position/:id, GET /delete_position/:id), following the
// repo's established `actor`-pattern convention (see
// modules/system_settings/system_settings.service.ts): the controller
// resolves `checkAdminLoginToken` into an `actor` object and passes it in;
// the service checks `actor.status` first and returns the actor object
// unchanged on failure.
//
// Dual cache invalidation (a real, pre-existing cross-cutting dependency,
// not introduced here): EVERY mutation below calls BOTH
// `deleteKeysByPattern('app_positions_list*')` (the legacy pattern) AND
// `invalidateStaticPositionsListCache()` (imported from the EXISTING
// `modules/work-experience/work-experience.cache.ts`, reused as-is — no
// second `.cache.ts` was created for this task). Both calls fire on every
// single write path below, exactly matching the legacy controller.
//
// FIX #2 (approved): `deletePosition` refuses deletion when
// `cln_professionals_work_experiences` still has a document whose
// `position_row_id` field equals this position's id — a scalar equality
// `findOne`, not an array `$in` query (see
// `buildPositionUsageCheckFilter`'s doc comment in
// `work-experience.positions.queries.ts` for why this field is scalar, not
// array-typed, unlike Tasks 3-5's guards).

const sanitize = require('mongo-sanitize')
const professionalPositionsM = require('../../models/app/static/professional_positionsM')
const professionalsWorkExperienceM = require('../../models/app/professionals_work_experienceM')
const { deleteKeysByPattern } = require('../../config/cache_helper')
const { getPresentDateTime } = require('../../utils/helpers/helper')
import { invalidateStaticPositionsListCache } from './work-experience.cache'
import { extractPaginatedResult, buildPaginatedFacetStages } from '../common/common.pagination'
import { validatePositionInput, PositionInput } from './work-experience.positions.validation'
import { buildPositionsListStages, buildPositionUsageCheckFilter } from './work-experience.positions.queries'

interface Actor {
  status: boolean
  message: any
}

/**
 * Preserve the exact legacy dual-invalidation pattern — both calls, on
 * every mutation, every time. See file header for why this is a real,
 * already-existing cross-cutting dependency and not something invented
 * for this task. Returns `deleteKeysByPattern`'s result so the
 * `update_position_details` update branch can echo it back as `delted_key`,
 * matching legacy exactly (see `savePosition` below).
 */
async function invalidatePositionCaches(): Promise<unknown> {
  const deletedKey = await deleteKeysByPattern('app_positions_list*')
  await invalidateStaticPositionsListCache()
  return deletedKey
}

export interface ListPositionsParams {
  actor: Actor
  search?: string
  activeStatus?: string
  skip: number
  limit: number
}

/**
 * Ports positions.js's GET /list (lines 12-197). The legacy handler itself
 * has no pagination (no skip/limit, no count) — optional skip/limit +
 * count are added here as the already-established module-wide convention
 * (see Task 1-5's `listExperienceLevels`/`listEventTags` etc.), layered on
 * top of the verbatim `buildPositionsListStages` pipeline via the shared
 * `$facet` helper.
 */
export async function listPositions({ actor, search, activeStatus, skip, limit }: ListPositionsParams) {
  if (!actor.status) {
    return actor
  }

  const stages = buildPositionsListStages({ search, active_status: activeStatus })
  const paginated = [...stages, ...buildPaginatedFacetStages({ skip, limit })]
  const aggregateOutput = await professionalPositionsM.aggregate(paginated)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface SavePositionParams {
  actor: Actor
  input: PositionInput
}

/**
 * Ports positions.js's POST /update_position_details (lines 202-268)
 * verbatim: position_row_id existence check (only when a row id was
 * supplied), duplicate position_name check via a case-insensitive
 * collation `findOne` excluding the row being updated (or excluding
 * nothing, for a new row, since `position_row_id` is `""` in that case —
 * matching the real legacy `$ne: position_row_id` behavior exactly), then
 * either an update or an insert.
 */
export async function savePosition({ actor, input }: SavePositionParams) {
  if (!actor.status) {
    return actor
  }

  const { errObj } = validatePositionInput(input)

  let position_row_id: number | '' = ''
  if (input.position_row_id) {
    const parsed = Number.parseInt(sanitize(String(input.position_row_id)))
    if (!Number.isNaN(parsed)) {
      position_row_id = parsed
      const check_query = await professionalPositionsM.findOne({ _id: position_row_id }, { _id: 1 })
      if (!check_query) {
        errObj['position_row_id'] = 'Sorry, Invalid position row id'
      }
    }
  }

  if (input.position_name) {
    const position_name = sanitize(input.position_name)
    const check_query = await professionalPositionsM
      .findOne({ _id: { $ne: position_row_id }, position_name: position_name }, { _id: 1 })
      .collation({ locale: 'en', strength: 2 })
    if (check_query) {
      errObj['position_name'] = 'Sorry, This position name is already exist.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const update_array: Record<string, any> = {}
  update_array['position_name'] = sanitize(input.position_name)

  if (position_row_id) {
    await professionalPositionsM.updateOne({ _id: position_row_id }, { $set: update_array })
    const deletedKey = await invalidatePositionCaches()
    return {
      status: true,
      delted_key: deletedKey,
      message: { alert_message: 'The users work position details has been updated successfully.' },
    }
  }

  update_array['date_n_time'] = getPresentDateTime()
  update_array['active_status'] = true
  await new professionalPositionsM(update_array).save()
  await invalidatePositionCaches()
  return { status: true, message: { alert_message: 'This users work position details has been added successfully.' } }
}

export interface PositionRowIdParams {
  actor: Actor
  positionRowId: number
}

/** Ports positions.js's GET /enable_position/:position_row_id (lines 270-295). */
export async function enablePosition({ actor, positionRowId }: PositionRowIdParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await professionalPositionsM.findOne({ _id: positionRowId, active_status: false })
  if (checkQuery) {
    await professionalPositionsM.updateOne({ _id: positionRowId }, { $set: { active_status: true } })
    await invalidatePositionCaches()
    return { status: true, message: { alert_message: 'This position details has been enabled successfully.' } }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid position row id or already enabled.' } }
}

/** Ports positions.js's GET /disable_position/:position_row_id (lines 297-322), mirror of enable above. */
export async function disablePosition({ actor, positionRowId }: PositionRowIdParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await professionalPositionsM.findOne({ _id: positionRowId, active_status: true })
  if (checkQuery) {
    await professionalPositionsM.updateOne({ _id: positionRowId }, { $set: { active_status: false } })
    await invalidatePositionCaches()
    return { status: true, message: { alert_message: 'This position details has been disabled successfully.' } }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid position row id or already disabled.' } }
}

/**
 * Ports positions.js's GET /delete_position/:position_row_id (lines
 * 324-349), with FIX #2 applied: refuses deletion when
 * `cln_professionals_work_experiences` has any document whose
 * `position_row_id` (scalar Number field) equals this position's id.
 */
export async function deletePosition({ actor, positionRowId }: PositionRowIdParams) {
  if (!actor.status) {
    return actor
  }

  const usageFilter = buildPositionUsageCheckFilter(positionRowId)
  const inUse = await professionalsWorkExperienceM.findOne(usageFilter)
  if (inUse) {
    return { status: false, message: { alert_message: 'This position is still used in a work experience and cannot be deleted.' } }
  }

  const checkQuery = await professionalPositionsM.findOne({ _id: positionRowId })
  if (checkQuery) {
    await professionalPositionsM.deleteOne({ _id: positionRowId })
    await invalidatePositionCaches()
    return { status: true, message: { alert_message: 'This position details has been deleted successfully.' } }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid position row id' } }
}
