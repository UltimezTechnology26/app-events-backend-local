// modules/professionals-audit/professionals-audit.service.ts
// Ports controllers/admin_panel/app/user.js's 4 ancillary/audit routes (~4618-5185). Same
// behavior, same response shapes — one confirmed real bug fixed (see getChangeLogs), a confirmed
// dead model resolved (not ported), one confirmed perf fix.
import {
  buildIpAddressListPipeline, buildIpAddressCountPipeline,
  buildPointsListPipeline,
  buildChangeLogsMatchConditions, buildChangeLogsPipeline,
  buildSeoOverviewRecentLogsPipeline, buildSeoOverviewUserStatsPipeline, buildSeoOverviewStaticStatsPipeline, buildSeoOverviewStaticUrlsPipeline,
} from './professionals-audit.queries'

// RESOLVED, NOT PORTED (per the plan's explicit instruction to confirm which of the two
// near-duplicate IP-address models is real before porting either): `models/app/
// professionals_ip_addressesM.js` (plural) has ZERO consumers anywhere in the repo (grepped) —
// only the singular `professionals_ip_addressM.js` is ever required, by this route, by
// controllers/admin_panel/events/event.js, and by utils/helpers/app_helper.js. The plural file is
// confirmed dead code; flagged here, not deleted (deletion is a separate, explicitly-confirmed step).
const ProfessionalsIpAddressM = require('../../../models/app/professionals_ip_addressM')
const ProfessionalsPointsM = require('../../../models/app/users/professionals_pointsM')
const SeoChangeLogsM = require('../../../models/seo_change_logsM')
const ProfessionalSeoDetailsM = require('../../../models/app/professionals_seo_detailsM')
const SeoStaticUrlsM = require('../../../models/seo_static_urlsM')

export async function getIpAddressList(skipRaw: string, limitRaw: string, search?: string, domainRaw?: string) {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100

  // CONFIRMED PERF FIX: legacy runs the list aggregate then the count aggregate sequentially —
  // independent of each other, Promise.all'd here (same class of fix as every prior phase).
  const [list, countResult] = await Promise.all([
    ProfessionalsIpAddressM.aggregate(buildIpAddressListPipeline(search, domainRaw, skip, limit)),
    ProfessionalsIpAddressM.aggregate(buildIpAddressCountPipeline(search, domainRaw)),
  ])
  return { status: true, message: list, count: countResult[0]?.count || 0 }
}

export async function getPointsList(pointType?: string, status?: string, search?: string) {
  const pointsList = await ProfessionalsPointsM.aggregate(buildPointsListPipeline(pointType, status, search))
  return { status: true, total: pointsList.length, data: pointsList }
}

// CONFIRMED BUG FIX, matching the precedent already set in Phase A (professionals.controller.ts's
// GET /overview): legacy's `/change_logs/:module_type/:module_id` has NO admin-token check
// whatsoever — not even an inconsistent access id, entirely open behind only the global
// `checkApiKey` gate. Gated here with the same `[1]` access id as every sibling route in this
// module, matching how Phase A closed the identical gap on `/overview` — a real behavior change,
// named here and in the phase report rather than silently ported forward.
export async function getChangeLogs(moduleType: string, moduleId: string, params: { search?: string; userType?: string; dateFrom?: string; dateTo?: string; pageRaw?: string; limitRaw?: string }) {
  const page = Number.parseInt(params.pageRaw as string) > 0 ? Number.parseInt(params.pageRaw as string) : 1
  const limit = Number.parseInt(params.limitRaw as string) > 0 ? Number.parseInt(params.limitRaw as string) : 10
  const skip = (page - 1) * limit

  const matchConditions = buildChangeLogsMatchConditions(moduleType, moduleId, params.userType, params.dateFrom, params.dateTo)

  // CONFIRMED PERF FIX: legacy awaits the count then the paginated aggregate sequentially —
  // independent of each other, Promise.all'd here.
  const [totalRecords, changeLogs] = await Promise.all([
    SeoChangeLogsM.countDocuments({ $and: matchConditions }),
    SeoChangeLogsM.aggregate(buildChangeLogsPipeline(matchConditions, params.search, skip, limit)),
  ])

  return { status: true, total: totalRecords, page, limit, totalPages: Math.ceil(totalRecords / limit), data: changeLogs }
}

function extractFacetCount(stats: any[], key: string): number {
  return stats?.[0]?.[key]?.[0]?.count || 0
}

export async function getSeoOverview() {
  const excludePatterns = ['watchlist', 'company', 'companies', 'partner']
  const excludeRegex = excludePatterns.join('|')

  const [recentLogs, userStats, staticStats, staticUrls] = await Promise.all([
    SeoChangeLogsM.aggregate(buildSeoOverviewRecentLogsPipeline()),
    ProfessionalSeoDetailsM.aggregate(buildSeoOverviewUserStatsPipeline()),
    SeoStaticUrlsM.aggregate(buildSeoOverviewStaticStatsPipeline(excludeRegex)),
    SeoStaticUrlsM.aggregate(buildSeoOverviewStaticUrlsPipeline(excludeRegex)),
  ])

  const response = {
    static_urls: staticUrls,
    recent_changes: recentLogs,
    total_urls: extractFacetCount(userStats, 'total') + extractFacetCount(staticStats, 'total'),
    h1_missing: extractFacetCount(userStats, 'h1_missing') + extractFacetCount(staticStats, 'h1_missing'),
    h2_missing: extractFacetCount(userStats, 'h2_missing') + extractFacetCount(staticStats, 'h2_missing'),
    multiple_h1: extractFacetCount(userStats, 'h1_multi') + extractFacetCount(staticStats, 'h1_multi'),
    bad_heading_sequence: extractFacetCount(userStats, 'bad_seq') + extractFacetCount(staticStats, 'bad_seq'),
    title_length_issues: {
      title_above_60_to_70: extractFacetCount(userStats, 'title_warn') + extractFacetCount(staticStats, 'title_warn'),
      title_above_70: extractFacetCount(userStats, 'title_err') + extractFacetCount(staticStats, 'title_err'),
    },
  }

  return { status: true, message: response }
}
