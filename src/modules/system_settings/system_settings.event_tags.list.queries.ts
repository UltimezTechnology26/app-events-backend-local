// modules/system_settings/system_settings.event_tags.list.queries.ts
//
// Ports controllers/admin_panel/category_tags/event_tags.js's GET /list
// (lines 12-167) match stage + aggregation assembly verbatim. The legacy
// handler builds `matchCondition` from `active_status` and an `$or`-wrapped
// `event_tag` regex search, then only pushes a `$match` stage at all if
// `matchCondition` has keys — reproduced exactly (no `$match` stage when
// there is no filter, rather than an unconditional `$match: {}`). The six
// per-count `$lookup` blocks themselves live in
// system_settings.event_tags.list.stages.ts, split out purely to stay
// under the file-length limit.
const { getPresentDateTime } = require('../../../utils/helpers/helper')

const eventTagsM = require('../../../models/app/static/event_tagsM')

import {
  buildTotalEventsStages,
  buildDeletedEventsStages,
  buildPendingEventsStages,
  buildUpcomingEventsStages,
  buildOngoingEventsStages,
  buildEndedEventsStages,
} from './system_settings.event_tags.list.stages'

export function buildEventTagsListStages(filters: { search?: string; active_status?: string }): object[] {
  const present = new Date(getPresentDateTime())
  const matchCondition: Record<string, unknown> = {}

  if (filters.active_status !== undefined) {
    const statusValue = Number(filters.active_status)
    matchCondition.active_status = statusValue === 1
  }

  if (filters.search && filters.search.trim() !== '') {
    matchCondition.$or = [{ event_tag: { $regex: filters.search, $options: 'i' } }]
  }

  const pipeline: object[] = []

  if (Object.keys(matchCondition).length > 0) {
    pipeline.push({ $match: matchCondition })
  }

  pipeline.push(
    ...buildTotalEventsStages(),
    ...buildDeletedEventsStages(),
    ...buildPendingEventsStages(),
    ...buildUpcomingEventsStages(present),
    ...buildOngoingEventsStages(present),
    ...buildEndedEventsStages(present),
    { $sort: { _id: -1 } }
  )

  return pipeline
}

export async function fetchEventTagsList(stages: object[]) {
  return eventTagsM.aggregate(stages)
}
