// modules/events-overview/events-overview.service.ts
//
// Consolidates controllers/admin_panel/events/event.js's GET /overview_details, GET
// /other_details, and the organizer-tag slice of GET /tags_data into ONE endpoint backing the
// "Events Overview" admin dashboard page - see events-overview.queries.ts's own top comment for
// the full perf-fix rationale. `employees_events_reports` is ported verbatim from /overview.
const eventM = require('../../../models/app/events/eventM')
const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
const companyM = require('../../../models/app/company/companyM')
import { getPresentDateTime } from '../../../utils/helpers/helper'
import {
  buildEventsOverviewPipeline,
  buildOwnerTypeBreakdownPipeline,
  buildDeletedEventsBreakdownPipeline,
  buildOrganizerTagBreakdownPipeline,
  buildEmployeesEventsReportsPipeline,
  extractFacetCount,
  EVENTS_BUSINESS_MODEL_ID,
} from './events-overview.queries'

const DATE_RANGE_FILTERS: Record<string, (now: Date) => Date> = {
  '1w': (now) => new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
  '1m': (now) => new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
  '6m': (now) => new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
  '1y': (now) => new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
}

function buildDateMatch(filter: string | undefined, now: Date, field: string): Record<string, unknown> {
  const resolver = filter ? DATE_RANGE_FILTERS[filter] : undefined
  if (!resolver) return {}
  return { [field]: { $gte: resolver(now) } }
}

function creatorGroup(facet: Record<string, unknown[]>, prefix: string, deletedCount: number) {
  const pending = extractFacetCount(facet[`${prefix}_pending`])
  const approved = extractFacetCount(facet[`${prefix}_approved`])
  const rejected = extractFacetCount(facet[`${prefix}_rejected`])
  const disabled = extractFacetCount(facet[`${prefix}_disabled`])
  return {
    pending,
    approved,
    rejected,
    disabled,
    deleted: deletedCount,
    total: pending + approved + rejected + disabled,
    ongoing: extractFacetCount(facet[`${prefix}_ongoing`]),
    upcoming: extractFacetCount(facet[`${prefix}_upcoming`]),
    ended: extractFacetCount(facet[`${prefix}_ended`]),
  }
}

export async function getEventsOverview(filterRaw?: string) {
  const now = new Date(getPresentDateTime() as string)
  // CONFIRMED QUIRK, deliberately not reproduced: legacy's /other_details filtered on a
  // different field (`date_n_time`) than /overview_details (`created_date_n_time`) for what's
  // presented as the same "date range" filter on one page - an inconsistency, not an intentional
  // distinction. Using one consistent field here for every date-filtered metric.
  const createdDateMatch = buildDateMatch(filterRaw, now, 'created_date_n_time')

  const [statsResult, deletedResult, ownerTypeResult, eventsTagResult, otherTagResult, employeesResult] = await Promise.all([
    eventM.aggregate(buildEventsOverviewPipeline({ dateMatch: createdDateMatch, now })),
    deleted_eventsM.aggregate(buildDeletedEventsBreakdownPipeline(createdDateMatch)),
    eventM.aggregate(buildOwnerTypeBreakdownPipeline({ dateMatch: createdDateMatch, now })),
    companyM.aggregate(buildOrganizerTagBreakdownPipeline({ business_model_id: EVENTS_BUSINESS_MODEL_ID })),
    companyM.aggregate(buildOrganizerTagBreakdownPipeline({ business_model_id: { $ne: EVENTS_BUSINESS_MODEL_ID } })),
    eventM.aggregate(buildEmployeesEventsReportsPipeline(createdDateMatch)),
  ])

  const stats = statsResult[0] || {}
  const deleted = deletedResult[0] || {}
  const ownerType = ownerTypeResult[0] || {}
  const eventsTag = eventsTagResult[0] || {}
  const otherTag = otherTagResult[0] || {}

  const pending = extractFacetCount(stats.pending)
  const approved = extractFacetCount(stats.approved)
  const rejected = extractFacetCount(stats.rejected)
  const disabled = extractFacetCount(stats.disabled)
  const deletedTotal = extractFacetCount(deleted.total)

  return {
    status: true,
    message: {
      total_events: pending + approved + rejected + disabled,
      pending_events: pending,
      approved_events: approved,
      rejected_events: rejected,
      disabled_events: disabled,
      deleted_events: deletedTotal,
      ongoing_events: extractFacetCount(stats.ongoing),
      upcomings_events: extractFacetCount(stats.upcoming),
      completed_events: extractFacetCount(stats.completed),
      by_creator: {
        host: creatorGroup(stats, 'host', extractFacetCount(deleted.host)),
        organizer: creatorGroup(stats, 'organizer', extractFacetCount(deleted.organizer)),
        host_n_organizer: creatorGroup(stats, 'host_n_organizer', extractFacetCount(deleted.host_n_organizer)),
        team: creatorGroup(stats, 'team', extractFacetCount(deleted.team)),
      },
      by_owner_type: {
        ongoing: { admin: extractFacetCount(ownerType.ongoing_admin), user: extractFacetCount(ownerType.ongoing_user) },
        upcoming: { admin: extractFacetCount(ownerType.upcoming_admin), user: extractFacetCount(ownerType.upcoming_user) },
        ended: { admin: extractFacetCount(ownerType.ended_admin), user: extractFacetCount(ownerType.ended_user) },
      },
      organizer_tags: {
        events_tag_total: extractFacetCount(eventsTag.total_organizers),
        events_tag_pending: extractFacetCount(eventsTag.pending),
        events_tag_approved: extractFacetCount(eventsTag.approved),
        other_tag_total: extractFacetCount(otherTag.total_organizers),
        other_tag_pending: extractFacetCount(otherTag.pending),
        other_tag_approved: extractFacetCount(otherTag.approved),
      },
      employees_events_reports: employeesResult,
    },
  }
}
