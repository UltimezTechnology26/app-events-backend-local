// modules/sources/sources.feeds.queries.ts
import { PipelineStage } from 'mongoose'
// Query builders for the feed-detail endpoint (the paginated "every item fetched by this one
// source" list shown on a source's detail view) - kept separate from sources.queries.ts /
// sources.stats.queries.ts since this is a different collection (CompanyFeedM/ProfessionalFeedM)
// and a different concern (one source's raw fetched items, not the sources registry).
/**
 * Builds the `source_url_id` filter used by both the paginated find and its count for the
 * feed-detail endpoint - `source_url_id` is the Sources registry row's own `_id`.
 */
export function buildFeedDetailFilter(sourceUrlId: string): Record<string, unknown> {
  return { source_url_id: sourceUrlId }
}

/**
 * Per-entity Twitter feed averages (Engagement/Avg Likes/Last Posted) - matches the OLD
 * BigQuery-backed admin panel's own `feeds/route.ts` exactly: grouped by ENTITY id (company_id/
 * professional_id), not by individual source row, since one company/professional can have more
 * than one tracked Twitter source and the reference table shows one combined figure per entity
 * row, not per source. Scoped to only the entity ids on the current page (same "only join what's
 * being returned" discipline already used for the entity-name $lookup in sources.queries.ts) -
 * cheap even though the Feed collections themselves are large, since `entityField` is indexed.
 */
export function buildTwitterEntityFeedAveragesPipeline(entityField: 'company_id' | 'professional_id', entityIds: number[]): PipelineStage[] {
  return [
    { $match: { source_type: 'twitter', [entityField]: { $in: entityIds } } },
    {
      $group: {
        _id: `$${entityField}`,
        avg_engagement_rate: { $avg: '$normalized_data.engagement_rate' },
        avg_likes: { $avg: '$normalized_data.likes' },
        last_posted_at: { $max: '$normalized_data.posted_at' },
      },
    },
  ]
}

/**
 * Per-entity Website "latest scrape session" fields (Words/Quality/Features) - matches the OLD
 * BigQuery-backed admin panel's own `website/feeds/route.ts` exactly: a `ROW_NUMBER() OVER
 * (PARTITION BY company_id ORDER BY fetched_at DESC) WHERE rn = 1` join, i.e. the MOST RECENT
 * scrape session's own normalized_data, not an average across every session (unlike Twitter's
 * engagement/likes, which genuinely are averages there). Grouped by entity, same "one company can
 * have more than one tracked website source, shown as one combined row" reasoning as Twitter.
 */
export function buildWebsiteEntityLatestFeedPipeline(entityField: 'company_id' | 'professional_id', entityIds: number[]): PipelineStage[] {
  return [
    { $match: { source_type: 'website', [entityField]: { $in: entityIds } } },
    { $sort: { fetched_at: -1 } },
    {
      $group: {
        _id: `$${entityField}`,
        total_word_count: { $first: '$normalized_data.total_word_count' },
        content_quality: { $first: '$normalized_data.content_quality' },
        has_blog: { $first: '$normalized_data.has_blog' },
        has_team_page: { $first: '$normalized_data.has_team_page' },
        has_careers: { $first: '$normalized_data.has_careers' },
        has_contact: { $first: '$normalized_data.has_contact' },
        has_faq: { $first: '$normalized_data.has_faq' },
      },
    },
  ]
}

/**
 * Per-entity RSS feed stats (Avg Words/Total Posts/Latest Post) - matches the OLD BigQuery-backed
 * admin panel's own `rss/feeds/route.ts` exactly: `avg_words`/`total_posts` are real averages/
 * counts across every fetched post (same grouping shape as Twitter's engagement/likes averages),
 * while `latest_post_title`/`latest_post_date` are the single most recent post's own fields (an
 * `ARRAY_AGG(... ORDER BY fetched_at DESC LIMIT 1)` there, a plain `$sort` + `$first` here).
 */
export function buildRssEntityFeedStatsPipeline(entityField: 'company_id' | 'professional_id', entityIds: number[]): PipelineStage[] {
  return [
    { $match: { source_type: { $in: ['rss', 'blog'] }, [entityField]: { $in: entityIds } } },
    { $sort: { fetched_at: -1 } },
    {
      $group: {
        _id: `$${entityField}`,
        avg_words: { $avg: '$normalized_data.word_count' },
        total_posts: { $sum: 1 },
        latest_post_title: { $first: '$normalized_data.title' },
        latest_post_date: { $first: '$normalized_data.posted_at' },
      },
    },
  ]
}
