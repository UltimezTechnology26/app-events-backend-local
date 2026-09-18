// modules/system_settings/system_settings.area_of_interests.status.service.ts
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's GET
// /enable_looking/:looking_id, GET /disable_looking/:looking_id, GET
// /delete_looking_for/:looking_id. Split out of
// system_settings.area_of_interests.service.ts purely to stay under the
// file-length limit.
//
// - `disable_looking` has NO `active_status` condition in its existence
//   check, unlike `enable_looking` (which requires `active_status: false`).
//   This means disabling an already-disabled row still succeeds. Preserved
//   exactly — not one of the two approved fixes.
// - `enable_looking`/`disable_looking`/`delete_looking_for` all echo the
//   cache-invalidation result back to the client as a `delted_key` field on
//   the response — preserved exactly.
// - FIX #2: `deleteAreaOfInterest` refuses deletion when `cln_professionals`
//   still has a document whose `looking_for_id` array contains this area's
//   id.

import {
  buildAreaOfInterestUsageCheckFilter,
  findAreaOfInterestByIdAndStatus,
  updateAreaOfInterestStatus,
  findAreaOfInterestById,
  deleteAreaOfInterestById,
  findProfessionalUsingLookingFor,
} from './system_settings.area_of_interests.queries'
import { invalidateAreaOfInterestsCaches } from './system_settings.cache'
import { Actor } from './system_settings.types'

export interface ToggleAreaOfInterestParams {
  actor: Actor
  requestRowId: number
}

/** Ports area_of_interests.js's GET /enable_looking/:looking_id (lines 262-286). */
export async function enableAreaOfInterest({ actor, requestRowId }: ToggleAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findAreaOfInterestByIdAndStatus(requestRowId, false)
  if (checkQuery) {
    await updateAreaOfInterestStatus(requestRowId, true)
    const [deletedKey] = await invalidateAreaOfInterestsCaches()
    return {
      status: true,
      message: { alert_message: 'This Area of interest has been enabled successfully.' },
      delted_key: deletedKey,
    }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Area of interest id or already enabled.' },
  }
}

/**
 * Ports area_of_interests.js's GET /disable_looking/:looking_id (lines
 * 288-312). NOTE: unlike enable above, the legacy existence check here has
 * NO `active_status` condition — preserved exactly (see file-header note).
 */
export async function disableAreaOfInterest({ actor, requestRowId }: ToggleAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findAreaOfInterestById(requestRowId)
  if (checkQuery) {
    await updateAreaOfInterestStatus(requestRowId, false)
    const [deletedKey] = await invalidateAreaOfInterestsCaches()
    return {
      status: true,
      message: { alert_message: 'This Area of interest has been disabled successfully.' },
      delted_key: deletedKey,
    }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Area of interest id or already disabled.' },
  }
}

export interface DeleteAreaOfInterestParams {
  actor: Actor
  requestRowId: number
}

/** Ports area_of_interests.js's GET /delete_looking_for/:looking_id (lines 314-338), with FIX #2 applied. */
export async function deleteAreaOfInterest({ actor, requestRowId }: DeleteAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const usageFilter = buildAreaOfInterestUsageCheckFilter(requestRowId)
  const inUse = await findProfessionalUsingLookingFor(usageFilter)
  if (inUse) {
    return {
      status: false,
      message: { alert_message: 'This Area of interest is still assigned to a professional and cannot be deleted.' },
    }
  }

  const checkQuery = await findAreaOfInterestById(requestRowId)
  if (checkQuery) {
    await deleteAreaOfInterestById(requestRowId)
    const [deletedKey] = await invalidateAreaOfInterestsCaches()
    return {
      status: true,
      message: { alert_message: 'This Area of interest has been deleted successfully.' },
      delted_key: deletedKey,
    }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid Area of interest id' } }
}
