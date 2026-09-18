// modules/system_settings/system_settings.user_expertise.status.service.ts
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's GET
// /enable_position/:designation_id, GET /disable_position/:designation_id,
// GET /delete_position/:designation_id. Split out of
// system_settings.user_expertise.service.ts purely to stay under the
// file-length limit.
//
// - `enable_position` does NOT echo `delted_key` on its response, but
//   `disable_position` DOES (`delted_key: deletedKey`, verbatim) and
//   `delete_position` does NOT — a three-way split unique to this legacy
//   file (area_of_interests.js's enable/disable/delete all echo it
//   uniformly). Preserved exactly: only disable's response includes
//   `delted_key` here.
// - FIX #2: `deleteUserExpertise` refuses deletion when `cln_professionals`
//   still has a document whose `designation_id` array contains this
//   designation's id.

import {
  buildUserExpertiseUsageCheckFilter,
  findUserExpertiseByIdAndStatus,
  updateUserExpertiseStatus,
  findUserExpertiseById,
  deleteUserExpertiseById,
  findProfessionalUsingDesignation,
} from './system_settings.user_expertise.queries'
import { invalidateUserExpertiseCaches } from './system_settings.cache'
import { Actor } from './system_settings.types'

export interface ToggleUserExpertiseParams {
  actor: Actor
  requestRowId: number
}

/** Ports user_expertise.js's GET /enable_position/:designation_id (lines 266-292). */
export async function enableUserExpertise({ actor, requestRowId }: ToggleUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findUserExpertiseByIdAndStatus(requestRowId, false)
  if (checkQuery) {
    await updateUserExpertiseStatus(requestRowId, true)
    await invalidateUserExpertiseCaches()
    return { status: true, message: { alert_message: 'This expertise enabled successfully.' } }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid expertise id or already enabled.' },
  }
}

/**
 * Ports user_expertise.js's GET /disable_position/:designation_id (lines
 * 294-319). NOTE: unlike enable/delete below, the legacy response here
 * echoes the cache-invalidation result back as `delted_key` — preserved
 * exactly (see file-header note).
 */
export async function disableUserExpertise({ actor, requestRowId }: ToggleUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findUserExpertiseById(requestRowId)
  if (checkQuery) {
    await updateUserExpertiseStatus(requestRowId, false)
    const [deletedKey] = await invalidateUserExpertiseCaches()
    return {
      status: true,
      message: { alert_message: 'This expertise disabled successfully.' },
      delted_key: deletedKey,
    }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid expertise id or already disabled.' },
  }
}

export interface DeleteUserExpertiseParams {
  actor: Actor
  requestRowId: number
}

/** Ports user_expertise.js's GET /delete_position/:designation_id (lines 321-346), with FIX #2 applied. */
export async function deleteUserExpertise({ actor, requestRowId }: DeleteUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const usageFilter = buildUserExpertiseUsageCheckFilter(requestRowId)
  const inUse = await findProfessionalUsingDesignation(usageFilter)
  if (inUse) {
    return {
      status: false,
      message: { alert_message: 'This user expertise is still assigned to a professional and cannot be deleted.' },
    }
  }

  const checkQuery = await findUserExpertiseById(requestRowId)
  if (checkQuery) {
    await deleteUserExpertiseById(requestRowId)
    await invalidateUserExpertiseCaches()
    return { status: true, message: { alert_message: 'This expertise has been deleted successfully.' } }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid expertise id' } }
}
