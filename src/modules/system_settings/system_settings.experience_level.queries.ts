// modules/system_settings/system_settings.experience_level.queries.ts
import { buildPaginatedFacetStages } from '../common/common.pagination'

const experienceLevelsM = require('../../../models/app/static/experience_levelsM')

/**
 * Ports experience_level.js's GET /list handler, which runs a plain
 * `experience_levelsM.find()` with no filter at all (no search support, no
 * active_status filter). There is no aggregation pipeline in the legacy
 * handler to port verbatim, so this exports a plain-object filter builder
 * instead of aggregation stages. `search` is a new, additive optional
 * capability (fix #5 pagination work) — when omitted, the filter is `{}`,
 * which behaves identically to the legacy unfiltered `.find()`.
 */
export function buildExperienceLevelListFilter(filters: { search?: string }): Record<string, unknown> {
  const filter: Record<string, unknown> = {}
  if (filters.search) {
    filter.experience = { $regex: filters.search, $options: 'i' }
  }
  return filter
}

/**
 * Combines the filter above with the standard $facet pagination stages
 * (common.pagination.ts) so the service layer only needs to call `.aggregate()`.
 */
export function buildExperienceLevelListPipeline({
  filter,
  skip,
  limit,
}: {
  filter: Record<string, unknown>
  skip: number
  limit: number
}) {
  return [{ $match: filter }, ...buildPaginatedFacetStages({ skip, limit })]
}

/**
 * Data-access layer for this category — the only place `experienceLevelsM`
 * is touched directly. system_settings.experience_level.service.ts
 * orchestrates business logic and calls these instead of talking to the
 * model itself.
 */
export async function fetchExperienceLevelsList(stages: object[]) {
  return experienceLevelsM.aggregate(stages)
}

export async function insertExperienceLevel(experience: unknown, dateNTime: string) {
  return new experienceLevelsM({ experience, active_status: true, date_n_time: dateNTime }).save()
}

/** Legacy does NOT wrap this in `$set` — preserved exactly, see updateExperienceLevel's doc comment. */
export async function rawUpdateExperienceLevel(requestRowId: number, experience: unknown) {
  return experienceLevelsM.updateOne({ _id: requestRowId }, { experience })
}

export async function findExperienceLevelByIdAndStatus(requestRowId: number, activeStatus: boolean) {
  return experienceLevelsM.findOne({ _id: requestRowId, active_status: activeStatus })
}

export async function updateExperienceLevelStatus(requestRowId: number, activeStatus: boolean) {
  return experienceLevelsM.updateOne({ _id: requestRowId }, { $set: { active_status: activeStatus } })
}

export async function findExperienceLevelById(requestRowId: number) {
  return experienceLevelsM.findOne({ _id: requestRowId })
}

export async function deleteExperienceLevelById(requestRowId: number) {
  return experienceLevelsM.deleteOne({ _id: requestRowId })
}
