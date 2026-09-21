// modules/community-admin/community-admin.request-article.service.ts
//
// Ports controllers/admin_panel/main/community/request_article.js (Phase 4: Requested Articles).
// Backend-only per the 2026-09-19 scope change - no admin-panel frontend page is built for this.
//
// `community_article_requestsM` is NOT colocated here - confirmed it still has a third, untouched
// legacy consumer (controllers/admin_panel/main/academy/overview.js:275, a plain
// `countDocuments()` call) that isn't part of this migration phase and stays live. Colocating and
// re-declaring the schema here would throw `OverwriteModelError` the moment both files load in
// the same process - same "leave shared models in top-level models/, re-export instead of
// redeclare" exception already applied throughout this project (e.g. community_postsM).
const community_article_requestsM = require('../../../models/main/community/community_article_requestsM')
import { buildRequestArticleListPipeline, buildRequestArticleMatchQuery, extractRequestArticleListResult } from './community-admin.request-article.queries'
import { GetRequestArticleListParams, RequestArticleStatus } from './community-admin.request-article.types'

const VALID_STATUSES: RequestArticleStatus[] = ['published', 'unpublished']

/** Ports GET /list/:skip/:limit (~line 7-91). See the queries file's own doc comment for the confirmed count-ignores-filters bug fixed here. */
export async function getRequestArticleList(params: GetRequestArticleListParams) {
  const skip = !Number.isNaN(Number.parseInt(params.skipRaw)) ? Number.parseInt(params.skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(params.limitRaw)) ? Number.parseInt(params.limitRaw) : 10

  const matchConditions = buildRequestArticleMatchQuery({ search: params.search?.trim(), startDate: params.startDate, endDate: params.endDate })
  const pipeline = buildRequestArticleListPipeline({ matchConditions, skip, limit })
  const aggregateOutput = await community_article_requestsM.aggregate(pipeline)
  const { data, count } = extractRequestArticleListResult(aggregateOutput)

  return { status: true, message: data, count }
}

/**
 * Ports POST /change_status/:id (~line 93-132) verbatim, including the real field-naming gap
 * already confirmed against the legacy frontend: `admin-coinpedia/components/community/
 * request_article_details.js` validates a `reason` textarea client-side (required, min 5 chars)
 * for Unpublish, but its own POST body only ever sends `{status: ...}` - `reason` is collected
 * and then silently discarded, never reaching this route at all. Separately, THIS backend route
 * itself never accepted a `reason` field either - it reads `comment` (`unpublished_comment` on
 * save), a different name than what the legacy frontend was trying (and failing) to send. So the
 * whole reason-collection flow is dead on both ends, not just a frontend omission - ported as-is,
 * flagged for the user's call on whether/how to wire it up when this phase's own admin panel
 * work (if any) is scoped, per the "no admin-panel frontend for now" instruction.
 */
export async function updateRequestArticleStatus(idRaw: string, status: string, comment?: string) {
  if (!VALID_STATUSES.includes(status as RequestArticleStatus)) {
    return { status: false, message: 'Invalid status value' }
  }

  const updatedArticle = await community_article_requestsM.findOneAndUpdate(
    { _id: idRaw, status: 'pending' },
    { status, unpublished_comment: status === 'unpublished' ? comment ?? '' : '' },
    { new: true },
  )

  if (!updatedArticle) {
    return { status: false, message: 'Article request not found' }
  }

  return { status: true, message: `Article status updated to ${status}`, data: updatedArticle }
}
