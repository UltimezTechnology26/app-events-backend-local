// modules/work-experience/work-experience.positions.service.ts
//
// Ports controllers/admin_panel/category_tags/positions.js's GET /list and
// POST /update_position_details, following the repo's established
// `actor`-pattern convention (see
// modules/system_settings/system_settings.service.ts): the controller
// resolves `checkAdminLoginToken` into an `actor` object and passes it in;
// the service checks `actor.status` first and returns the actor object
// unchanged on failure. Enable/disable/delete live in
// work-experience.positions.status.service.ts — split out purely to stay
// under the file-length limit; both files share the dual cache-invalidation
// helper in work-experience.positions.invalidate.ts.

const sanitize = require('mongo-sanitize')
const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { invalidatePositionCaches } from './work-experience.positions.invalidate'
import { extractPaginatedResult, buildPaginatedFacetStages } from '../common/common.pagination'
import { validatePositionInput, PositionInput } from './work-experience.positions.validation'
import { buildPositionsListStages, fetchPositionsList } from './work-experience.positions.list.queries'
import { findPositionById, findDuplicatePositionName, updatePosition, insertPosition } from './work-experience.positions.queries'

interface Actor {
  status: boolean
  message: unknown
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
  const aggregateOutput = await fetchPositionsList(paginated)
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
      const check_query = await findPositionById(position_row_id)
      if (!check_query) {
        errObj['position_row_id'] = 'Sorry, Invalid position row id'
      }
    }
  }

  if (input.position_name) {
    const position_name = sanitize(input.position_name)
    const check_query = await findDuplicatePositionName(position_row_id, position_name)
    if (check_query) {
      errObj['position_name'] = 'Sorry, This position name is already exist.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const update_array: Record<string, unknown> = {}
  update_array['position_name'] = sanitize(input.position_name)

  if (position_row_id) {
    await updatePosition(position_row_id, update_array)
    const deletedKey = await invalidatePositionCaches()
    return {
      status: true,
      delted_key: deletedKey,
      message: { alert_message: 'The users work position details has been updated successfully.' },
    }
  }

  update_array['date_n_time'] = getPresentDateTime()
  update_array['active_status'] = true
  await insertPosition(update_array)
  await invalidatePositionCaches()
  return { status: true, message: { alert_message: 'This users work position details has been added successfully.' } }
}
