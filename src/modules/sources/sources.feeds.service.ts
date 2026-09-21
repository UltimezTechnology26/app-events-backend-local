// modules/sources/sources.feeds.service.ts
// Read-only feed-detail service - backs a source row's "every item fetched by this source" view
// (a tweet/RSS post/website scrape session per row), reading CompanyFeedM/ProfessionalFeedM
// (sources.feeds.models.ts). Same display-only scope as the rest of this module: no write path.
import { PipelineStage } from 'mongoose'
import { CompanyFeedM, ProfessionalFeedM } from './sources.feeds.models'
import { buildFeedDetailFilter } from './sources.feeds.queries'

/**
 * Returns one page of feed items (tweets/RSS posts/website scrape sessions) belonging to a single
 * Sources-registry row, newest first. `sourceUrlId` is that row's own `_id` (CompanySourceUrlM/
 * ProfessionalSourceUrlM), matched against the feed rows' `source_url_id`. Uses `.aggregate()`
 * (not `.find()`) to match this module's own convention (see sources.service.ts) - it also
 * sidesteps TS treating `CompanyFeedM | ProfessionalFeedM`'s `.find()` overloads as incompatible
 * with each other, since `.aggregate()` doesn't have that overload-union problem.
 */
export async function getSourceFeedDetail(entity: 'company' | 'professional', sourceUrlId: string, skip: number, limit: number) {
  const Model = entity === 'company' ? CompanyFeedM : ProfessionalFeedM
  const match: PipelineStage = { $match: buildFeedDetailFilter(sourceUrlId) }

  const [items, countResult] = await Promise.all([
    Model.aggregate([match, { $sort: { fetched_at: -1 } }, { $skip: skip }, { $limit: limit }]),
    Model.aggregate([match, { $count: 'count' }]),
  ])

  return { status: true, message: items, count: countResult[0]?.count || 0 }
}
