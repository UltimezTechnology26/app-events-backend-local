// modules/system_settings/system_settings.user_expertise.service.ts
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's GET
// /list, POST /save_n_add_position, POST
// /update_position/:designation_id. Enable/disable/delete live in
// system_settings.user_expertise.status.service.ts — split out purely to
// stay under the file-length limit.
//
// Legacy quirks preserved exactly:
// - The save route and update route use DIFFERENT required-field messages
//   for `designation_name` ('The expertise  field is required' [sic,
//   double space — a genuine legacy typo] vs 'The Designation Name field
//   is required') — both preserved via `validateUserExpertiseInput`'s
//   `requiredMessage` param.
// - `show_in_job_status` is carried through both save and update exactly as
//   the legacy handler does — written as-is (no default, no coercion).
// - Save's duplicate-name check does NOT exclude any row (new record), but
//   update's DOES exclude the row being updated via `_id: { $ne: ... }`.
// - The duplicate-name error message differs between save
//   ('This Expertise  is already exists.' [sic, double space + grammar
//   preserved verbatim]) and update ('This expertise tag already exists.').

import { validateUserExpertiseInput, UserExpertiseInput } from './system_settings.user_expertise.validation'
import { buildUserExpertiseListStages, fetchUserExpertiseList } from './system_settings.user_expertise.list.queries'
import {
  findUserExpertiseByNormalizedName,
  insertUserExpertise,
  findUserExpertiseByNormalizedNameExcluding,
  updateUserExpertiseFields,
} from './system_settings.user_expertise.queries'
import { extractPaginatedResult, buildPaginatedFacetStages } from '../common/common.pagination'
import { invalidateUserExpertiseCaches } from './system_settings.cache'
import { Actor } from './system_settings.types'

const { getPresentDateTime } = require('../../../utils/helpers/helper')

export interface ListUserExpertiseParams {
  actor: Actor
  search?: string
  status?: string
  skip: number
  limit: number
}

/** Ports user_expertise.js's GET /list (lines 11-143). */
export async function listUserExpertise({ actor, search, status, skip, limit }: ListUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const stages = buildUserExpertiseListStages({ search, status })
  const paginated = [...stages, ...buildPaginatedFacetStages({ skip, limit })]
  const aggregateOutput = await fetchUserExpertiseList(paginated)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface SaveUserExpertiseParams {
  actor: Actor
  input: UserExpertiseInput
}

/** Ports user_expertise.js's POST /save_n_add_position (lines 149-199). */
export async function saveUserExpertise({ actor, input }: SaveUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateUserExpertiseInput(input, 'The expertise  field is required')
  if (!valid) {
    return { status: false, message: errObj }
  }

  const normalizedName = (input.designation_name as string).trim().toLowerCase()
  const checkExisting = await findUserExpertiseByNormalizedName(normalizedName)

  if (checkExisting) {
    return {
      status: false,
      message: { designation_name: 'This Expertise  is already exists.' },
    }
  }

  await insertUserExpertise({
    designation_name: (input.designation_name as string).trim(),
    show_in_job_status: input.show_in_job_status,
    date_n_time: getPresentDateTime(),
  })
  await invalidateUserExpertiseCaches()

  return { status: true, message: { alert_message: 'New user expertise has been added successfully.' } }
}

export interface UpdateUserExpertiseParams {
  actor: Actor
  requestRowId: number
  input: UserExpertiseInput
}

/** Ports user_expertise.js's POST /update_position/:designation_id (lines 201-263). */
export async function updateUserExpertise({ actor, requestRowId, input }: UpdateUserExpertiseParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateUserExpertiseInput(input, 'The Designation Name field is required')
  if (!valid) {
    return { status: false, message: errObj }
  }

  const normalizedName = (input.designation_name as string).trim().toLowerCase()
  const checkExisting = await findUserExpertiseByNormalizedNameExcluding(requestRowId, normalizedName)

  if (checkExisting) {
    return {
      status: false,
      message: { designation_name: 'This expertise tag already exists.' },
    }
  }

  await updateUserExpertiseFields(requestRowId, {
    designation_name: (input.designation_name as string).trim(),
    show_in_job_status: input.show_in_job_status,
    date_n_time: getPresentDateTime(),
  })
  await invalidateUserExpertiseCaches()

  return {
    status: true,
    message: { alert_message: 'This user expertise has been updated successfully.' },
  }
}
