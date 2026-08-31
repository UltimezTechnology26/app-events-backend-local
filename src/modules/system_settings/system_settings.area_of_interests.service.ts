// modules/system_settings/system_settings.area_of_interests.service.ts
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's GET
// /list, POST /save_n_add_user_looking, POST /update_looking/:looking_id.
// Enable/disable/delete live in
// system_settings.area_of_interests.status.service.ts — split out purely
// to stay under the file-length limit.
//
// Legacy asymmetries preserved exactly (not fixes, just how the real file
// behaves):
// - Save's required-field message ('The Looking for Name field is
//   required') differs from update's ('The Looking for field is required').
// - Save's duplicate-name check does NOT exclude any row (new record), but
//   update's DOES exclude the row being updated via `_id: { $ne: ... }`.
// - Save trims the name before persisting; update does NOT trim it on
//   persist (only for the duplicate-name comparison).

import { validateAreaOfInterestInput, AreaOfInterestInput } from './system_settings.area_of_interests.validation'
import { buildAreaOfInterestsListStages, fetchAreaOfInterestsList } from './system_settings.area_of_interests.list.queries'
import {
  findAreaOfInterestByNormalizedName,
  insertAreaOfInterest,
  findAreaOfInterestByNormalizedNameExcluding,
  updateAreaOfInterestName,
} from './system_settings.area_of_interests.queries'
import { extractPaginatedResult, buildPaginatedFacetStages } from '../common/common.pagination'
import { invalidateAreaOfInterestsCaches } from './system_settings.cache'
import { Actor } from './system_settings.types'

const { getPresentDateTime } = require('../../../utils/helpers/helper')

export interface ListAreasOfInterestParams {
  actor: Actor
  search?: string
  status?: string
  skip: number
  limit: number
}

/** Ports area_of_interests.js's GET /list (lines 13-137). */
export async function listAreasOfInterest({ actor, search, status, skip, limit }: ListAreasOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const stages = buildAreaOfInterestsListStages({ search, status })
  const paginated = [...stages, ...buildPaginatedFacetStages({ skip, limit })]
  const aggregateOutput = await fetchAreaOfInterestsList(paginated)
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface SaveAreaOfInterestParams {
  actor: Actor
  input: AreaOfInterestInput
}

/** Ports area_of_interests.js's POST /save_n_add_user_looking (lines 142-196). */
export async function saveAreaOfInterest({ actor, input }: SaveAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateAreaOfInterestInput(input, 'The Looking for Name field is required')
  if (!valid) {
    return { status: false, message: errObj }
  }

  const normalizedName = (input.looking_for_name as string).trim().toLowerCase()
  const checkExisting = await findAreaOfInterestByNormalizedName(normalizedName)

  if (checkExisting) {
    return {
      status: false,
      message: { looking_for_name: 'This Area of interest already exists.' },
    }
  }

  await insertAreaOfInterest((input.looking_for_name as string).trim(), getPresentDateTime())
  await invalidateAreaOfInterestsCaches()

  return {
    status: true,
    message: { alert_message: 'New Area of interest details has been added successfully.' },
  }
}

export interface UpdateAreaOfInterestParams {
  actor: Actor
  requestRowId: number
  input: AreaOfInterestInput
}

/** Ports area_of_interests.js's POST /update_looking/:looking_id (lines 199-259). */
export async function updateAreaOfInterest({ actor, requestRowId, input }: UpdateAreaOfInterestParams) {
  if (!actor.status) {
    return actor
  }

  const { valid, errObj } = validateAreaOfInterestInput(input, 'The Looking for field is required')
  if (!valid) {
    return { status: false, message: errObj }
  }

  const normalizedName = (input.looking_for_name as string).trim().toLowerCase()
  const checkExisting = await findAreaOfInterestByNormalizedNameExcluding(requestRowId, normalizedName)

  if (checkExisting) {
    return {
      status: false,
      message: { looking_for_name: 'This Area of interest already exists.' },
    }
  }

  await updateAreaOfInterestName(requestRowId, input.looking_for_name, getPresentDateTime())
  await invalidateAreaOfInterestsCaches()

  return {
    status: true,
    message: { alert_message: 'This Area of interest details has been updated successfully.' },
  }
}
