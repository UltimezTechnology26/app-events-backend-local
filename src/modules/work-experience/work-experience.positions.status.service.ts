// modules/work-experience/work-experience.positions.status.service.ts
//
// Ports controllers/admin_panel/category_tags/positions.js's GET
// /enable_position/:position_row_id, GET
// /disable_position/:position_row_id, GET
// /delete_position/:position_row_id. Split out of
// work-experience.positions.service.ts purely to stay under the
// file-length limit.
//
// FIX #2 (approved): `deletePosition` refuses deletion when
// `cln_professionals_work_experiences` still has a document whose
// `position_row_id` field equals this position's id — a scalar equality
// `findOne`, not an array `$in` query (see
// `buildPositionUsageCheckFilter`'s doc comment in
// `work-experience.positions.queries.ts` for why this field is scalar, not
// array-typed, unlike Tasks 3-5's guards).

import { invalidatePositionCaches } from './work-experience.positions.invalidate'
import {
  findPositionByIdAndActiveStatus,
  findPositionByIdOnly,
  updatePosition,
  deletePositionById,
  findWorkExperienceUsingPosition,
} from './work-experience.positions.queries'

interface Actor {
  status: boolean
  message: unknown
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

  const checkQuery = await findPositionByIdAndActiveStatus(positionRowId, false)
  if (checkQuery) {
    await updatePosition(positionRowId, { active_status: true })
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

  const checkQuery = await findPositionByIdAndActiveStatus(positionRowId, true)
  if (checkQuery) {
    await updatePosition(positionRowId, { active_status: false })
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

  const inUse = await findWorkExperienceUsingPosition(positionRowId)
  if (inUse) {
    return { status: false, message: { alert_message: 'This position is still used in a work experience and cannot be deleted.' } }
  }

  const checkQuery = await findPositionByIdOnly(positionRowId)
  if (checkQuery) {
    await deletePositionById(positionRowId)
    await invalidatePositionCaches()
    return { status: true, message: { alert_message: 'This position details has been deleted successfully.' } }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid position row id' } }
}
