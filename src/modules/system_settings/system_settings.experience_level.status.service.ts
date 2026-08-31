// modules/system_settings/system_settings.experience_level.status.service.ts
//
// Ports experience_level.js's GET /enable/:request_row_id, GET
// /disable/:request_row_id, GET /delete/:request_row_id. Split out of
// system_settings.experience_level.service.ts purely to stay under the
// file-length limit — same actor-pattern convention applies.

import {
  findExperienceLevelByIdAndStatus,
  updateExperienceLevelStatus,
  findExperienceLevelById,
  deleteExperienceLevelById,
} from './system_settings.experience_level.queries'
import { Actor } from './system_settings.types'

export interface ToggleExperienceLevelParams {
  actor: Actor
  requestRowId: number
}

/**
 * Ports experience_level.js's GET /enable/:request_row_id (lines 90-113). The legacy
 * handler is NOT a simple "set active_status = true" — it first requires the row to
 * currently be active_status: false (i.e. it rejects enabling an already-enabled or
 * nonexistent row with a distinct error message). Preserved exactly rather than merged
 * into a single always-succeeds toggle.
 */
export async function enableExperienceLevel({ actor, requestRowId }: ToggleExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findExperienceLevelByIdAndStatus(requestRowId, false)
  if (checkQuery) {
    await updateExperienceLevelStatus(requestRowId, true)
    return { status: true, message: { alert_message: 'This Experience enabled successfully.' }, tokenStatus: true }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Experience row id  or already enabled.' },
    tokenStatus: true,
  }
}

/** Ports experience_level.js's GET /disable/:request_row_id (lines 115-137), mirror of enable above. */
export async function disableExperienceLevel({ actor, requestRowId }: ToggleExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findExperienceLevelByIdAndStatus(requestRowId, true)
  if (checkQuery) {
    await updateExperienceLevelStatus(requestRowId, false)
    return { status: true, message: { alert_message: 'This Experience disabled successfully.' }, tokenStatus: true }
  }

  return {
    status: false,
    message: { alert_message: 'Sorry, Invalid Experience id  or already disabled.' },
    tokenStatus: true,
  }
}

export interface DeleteExperienceLevelParams {
  actor: Actor
  requestRowId: number
}

/** Ports experience_level.js's GET /delete/:request_row_id (lines 139-162). */
export async function deleteExperienceLevel({ actor, requestRowId }: DeleteExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const checkQuery = await findExperienceLevelById(requestRowId)
  if (checkQuery) {
    await deleteExperienceLevelById(requestRowId)
    return { status: true, message: { alert_message: 'This Experience deleted successfully.' }, tokenStatus: true }
  }

  return { status: false, message: { alert_message: 'Sorry, Invalid Experience id ' }, tokenStatus: true }
}
