// modules/work-experience/work-experience.positions.list.queries.ts
//
// Ports controllers/admin_panel/category_tags/positions.js's GET /list
// (lines 12-197) match + pipeline assembly verbatim. The individual
// `$lookup`/`$addFields` blocks live in
// work-experience.positions.list.stages.ts, split out purely to stay under
// the file-length limit. Two things deliberately differ from the sibling
// category_tags modules already migrated into modules/system_settings/:
//
// - The legacy handler builds `filter` as a single plain object (never a
//   `filter_array`/`$and` wrapper) and always includes an (possibly empty)
//   `{ $match: filter }` as the pipeline's first stage — unlike
//   event_tags.js/area_of_interests.js, which conditionally omit the
//   `$match` stage entirely when there's nothing to filter on. Reproduced
//   exactly: `$match` always runs here, even with an empty filter object.
// - `active_status` is compared as a STRING ("1"/"0"), not coerced via
//   `Number(...) === 1` the way event_tags.js's list handler does it.
//   Preserved exactly per the task brief — do not normalize this to match
//   the sibling.
//
// The five status-count fields (pending/approved/rejected/disabled/deleted)
// plus the SIXTH `company_deleted_count` field are copied verbatim — this
// extra field is unique to positions.js among the category_tags list
// handlers read so far.

const professionalPositionsM = require('../../../models/app/static/professional_positionsM')

import { buildWorkExperienceJoinStages, buildUsersAndCompaniesLookupStages } from './work-experience.positions.list.stages'
import {
  buildUserStatusCountsStage,
  buildCompanyDeletedCountAndCleanupStages,
} from './work-experience.positions.list.counts'

export function buildPositionsListFilter(filters: { search?: string; active_status?: string }): Record<string, unknown> {
  const filter: Record<string, unknown> = {}

  if (filters.search) {
    filter.position_name = { $regex: filters.search.trim(), $options: 'i' }
  }

  if (filters.active_status === '1') {
    filter.active_status = true
  } else if (filters.active_status === '0') {
    filter.active_status = false
  }

  return filter
}

export function buildPositionsListStages(filters: { search?: string; active_status?: string }): object[] {
  const filter = buildPositionsListFilter(filters)

  return [
    { $match: filter },
    ...buildWorkExperienceJoinStages(),
    ...buildUsersAndCompaniesLookupStages(),
    buildUserStatusCountsStage(),
    ...buildCompanyDeletedCountAndCleanupStages(),
    { $sort: { position_name: 1 } },
  ]
}

export async function fetchPositionsList(stages: object[]) {
  return professionalPositionsM.aggregate(stages)
}
