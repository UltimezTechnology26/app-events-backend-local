// modules/system_settings/system_settings.experience_level.service.ts
//
// Ports experience_level.js's GET /list, POST /save, POST
// /update/:request_row_id (read + write handlers). Enable/disable/delete
// live in system_settings.experience_level.status.service.ts — split out
// purely to stay under the file-length limit, following the repo's
// established `actor`-pattern convention (see modules/partners/partners.service.ts):
// the controller resolves `checkAdminLoginToken` into an `actor` object and
// passes it in; the service checks `actor.status` and returns the actor
// object itself (matching the legacy `res.json(checkToken)` behavior on
// auth failure) before doing any work.

const { getPresentDateTime } = require('../../../utils/helpers/helper')
import { extractPaginatedResult } from '../common/common.pagination'
import { validateExperienceLevelInput, ExperienceLevelInput } from './system_settings.experience_level.validation'
import {
  buildExperienceLevelListFilter,
  buildExperienceLevelListPipeline,
  fetchExperienceLevelsList,
  insertExperienceLevel,
  rawUpdateExperienceLevel,
} from './system_settings.experience_level.queries'
import { Actor } from './system_settings.types'

export interface ListExperienceLevelsParams {
  actor: Actor
  search?: string
  skip: number
  limit: number
}

/**
 * Ports experience_level.js's GET /list (lines 10-27). The legacy handler runs a
 * plain, unfiltered `experience_levelsM.find()` with no pagination and returns the
 * full array as `message`. Fix #5 (approved) adds optional skip/limit pagination via
 * common.pagination.ts's $facet helper — when no skip/limit given, callers default to
 * a full list (see controller), preserving the legacy "return everything" behavior.
 * `count` is new (added by the pagination fix); `data`/`message` carries the same
 * records the legacy `.find()` would have returned.
 */
export async function listExperienceLevels({ actor, search, skip, limit }: ListExperienceLevelsParams) {
  if (!actor.status) {
    return actor
  }

  const filter = buildExperienceLevelListFilter({ search })
  const stages = buildExperienceLevelListPipeline({ filter, skip, limit })
  const aggregateOutput = await fetchExperienceLevelsList(stages)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count, tokenStatus: true }
}

export interface SaveExperienceLevelParams {
  actor: Actor
  input: ExperienceLevelInput
}

/** Ports experience_level.js's POST /save (lines 29-57). */
export async function saveExperienceLevel({ actor, input }: SaveExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateExperienceLevelInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  await insertExperienceLevel(input.experience, getPresentDateTime())

  return { status: true, message: { alert_message: 'New Experience created successfully.' }, tokenStatus: true }
}

export interface UpdateExperienceLevelParams {
  actor: Actor
  requestRowId: number
  input: ExperienceLevelInput
}

/**
 * Ports experience_level.js's POST /update/:request_row_id (lines 59-88). The legacy
 * handler does NOT check whether a document with this id exists — it always calls
 * `updateOne` and always responds with the success message regardless of match count.
 * Preserved exactly: no existence check here either.
 */
export async function updateExperienceLevel({ actor, requestRowId, input }: UpdateExperienceLevelParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateExperienceLevelInput(input)
  if (!valid) {
    return { status: false, message: errObj }
  }

  await rawUpdateExperienceLevel(requestRowId, input.experience)

  return { status: true, message: { alert_message: 'Experience updated successfully.' }, tokenStatus: true }
}
