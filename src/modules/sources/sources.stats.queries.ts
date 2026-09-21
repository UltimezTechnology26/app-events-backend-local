// modules/sources/sources.stats.queries.ts
//
// Stats pipeline builders for the Sources admin pages. Split out of sources.queries.ts to keep
// that file focused on match/list/count and this one focused on aggregation-heavy stats math.
//
// The per-source-type breakdown value sets below (tiers, fetch_status buckets, refresh_type,
// scrapers, etc.) are NOT invented here - they're confirmed against the real BigQuery-backed
// admin panel this module was migrated from (cp-professionals-companies-events's own
// twitter/rss/website overview routes), carried over verbatim so the frontend can keep the exact
// same stat cards/labels it already has.
import { PipelineStage } from 'mongoose'
import { ENTITY_LOOKUPS } from './sources.queries'

const DEFAULT_STATS_GROUP = {
  total_sources: { $sum: 1 },
  manual_sources: { $sum: { $cond: [{ $eq: ['$source_origin', 'manual'] }, 1, 0] } },
  database_sources: { $sum: { $cond: [{ $eq: ['$source_origin', 'database'] }, 1, 0] } },
  generated_sources: { $sum: { $cond: [{ $eq: ['$source_origin', 'generated'] }, 1, 0] } },
  verified_sources: { $sum: { $cond: [{ $eq: ['$is_verified', true] }, 1, 0] } },
}

const DEFAULT_STATS_PROJECT = {
  _id: 0,
  total_sources: 1,
  manual_sources: 1,
  database_sources: 1,
  generated_sources: 1,
  verified_sources: 1,
  unique_entities_count: { $size: '$unique_entities' },
  unique_source_types_count: { $size: '$unique_source_types' },
}

// `now` is threaded in (rather than each field calling `new Date()` separately) so every
// relative-time bucket in a single pipeline is computed against the exact same instant.
function tierCountExpr(tier: number): Record<string, unknown> {
  return { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $eq: ['$platform_meta.fetch_tier', tier] }] }, 1, 0] } }
}

function fetchStatusCountExpr(value: string): Record<string, unknown> {
  return { $sum: { $cond: [{ $eq: ['$platform_meta.fetch_status', value] }, 1, 0] } }
}

function unprocessedFetchStatusExpr(): Record<string, unknown> {
  // `$eq` against `null` matches both an explicit null and a missing field in the aggregation
  // framework, so this alone covers "fetch_status was never set".
  return { $sum: { $cond: [{ $eq: ['$platform_meta.fetch_status', null] }, 1, 0] } }
}

function fieldExistsExpr(path: string): Record<string, unknown> {
  return { $ne: [{ $type: path }, 'missing'] }
}

function twitterGroupFields(now: Date): Record<string, unknown> {
  return {
    tw_tier1: tierCountExpr(1),
    tw_tier2: tierCountExpr(2),
    tw_tier3: tierCountExpr(3),
    tw_tier4: tierCountExpr(4),
    tw_fs_success: fetchStatusCountExpr('success'),
    tw_fs_no_new_posts: fetchStatusCountExpr('no_new_posts'),
    tw_fs_pending: fetchStatusCountExpr('pending'),
    tw_fs_failed: fetchStatusCountExpr('failed'),
    tw_fs_not_found: fetchStatusCountExpr('not_found'),
    tw_fs_invalid_url: fetchStatusCountExpr('invalid_url'),
    tw_fs_unprocessed: unprocessedFetchStatusExpr(),
    tw_due_for_fetch: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ['$status', 'active'] },
              fieldExistsExpr('$platform_meta.platform_user_id'),
              { $in: ['$platform_meta.fetch_status', ['success', 'no_new_posts']] },
              { $or: [{ $eq: ['$platform_meta.next_fetch_at', null] }, { $lte: ['$platform_meta.next_fetch_at', now] }] },
            ],
          },
          1,
          0,
        ],
      },
    },
  }
}

function twitterProjectFields(): Record<string, unknown> {
  return {
    breakdown: {
      tiers: { tier1: '$tw_tier1', tier2: '$tw_tier2', tier3: '$tw_tier3', tier4: '$tw_tier4' },
      fetch_status: {
        success: '$tw_fs_success',
        no_new_posts: '$tw_fs_no_new_posts',
        pending: '$tw_fs_pending',
        failed: '$tw_fs_failed',
        not_found: '$tw_fs_not_found',
        invalid_url: '$tw_fs_invalid_url',
        unprocessed: '$tw_fs_unprocessed',
      },
      due_for_fetch: '$tw_due_for_fetch',
    },
  }
}

function rssGroupFields(): Record<string, unknown> {
  return {
    rss_fs_success: fetchStatusCountExpr('success'),
    rss_fs_no_new_posts: fetchStatusCountExpr('no_new_posts'),
    rss_fs_no_feed: fetchStatusCountExpr('no_feed'),
    rss_fs_failed: fetchStatusCountExpr('failed'),
    // Matches the old system exactly: "pending" is both the explicit value AND null/missing.
    rss_fs_pending: {
      $sum: { $cond: [{ $or: [{ $eq: ['$platform_meta.fetch_status', 'pending'] }, { $eq: ['$platform_meta.fetch_status', null] }] }, 1, 0] },
    },
    rss_ft_rss: { $sum: { $cond: [{ $eq: ['$platform_meta.feed_type', 'rss'] }, 1, 0] } },
    rss_ft_atom: { $sum: { $cond: [{ $eq: ['$platform_meta.feed_type', 'atom'] }, 1, 0] } },
    rss_ft_json_feed: { $sum: { $cond: [{ $eq: ['$platform_meta.feed_type', 'json_feed'] }, 1, 0] } },
  }
}

function rssProjectFields(): Record<string, unknown> {
  return {
    breakdown: {
      fetch_status: {
        success: '$rss_fs_success',
        no_new_posts: '$rss_fs_no_new_posts',
        no_feed: '$rss_fs_no_feed',
        failed: '$rss_fs_failed',
        pending: '$rss_fs_pending',
      },
      feed_types: { rss: '$rss_ft_rss', atom: '$rss_ft_atom', json_feed: '$rss_ft_json_feed' },
    },
  }
}

function websiteGroupFields(): Record<string, unknown> {
  return {
    web_fs_success: fetchStatusCountExpr('success'),
    web_fs_blocked: fetchStatusCountExpr('blocked'),
    web_fs_failed: fetchStatusCountExpr('failed'),
    web_fs_pending: fetchStatusCountExpr('pending'),
    web_fs_unprocessed: unprocessedFetchStatusExpr(),
    web_rt_active: { $sum: { $cond: [{ $eq: ['$platform_meta.refresh_type', 'active'] }, 1, 0] } },
    web_rt_static: { $sum: { $cond: [{ $eq: ['$platform_meta.refresh_type', 'static'] }, 1, 0] } },
    web_rt_blocked: { $sum: { $cond: [{ $eq: ['$platform_meta.refresh_type', 'blocked'] }, 1, 0] } },
    web_scraper_jina: { $sum: { $cond: [{ $eq: ['$platform_meta.scraper_used', 'jina'] }, 1, 0] } },
    web_scraper_firecrawl: { $sum: { $cond: [{ $eq: ['$platform_meta.scraper_used', 'firecrawl'] }, 1, 0] } },
    web_scraper_raw: { $sum: { $cond: [{ $eq: ['$platform_meta.scraper_used', 'raw'] }, 1, 0] } },
    web_sitemap_found_count: { $sum: { $cond: [{ $eq: ['$platform_meta.sitemap_found', true] }, 1, 0] } },
    web_avg_pages_scraped: { $avg: '$platform_meta.pages_scraped' },
  }
}

function websiteProjectFields(): Record<string, unknown> {
  return {
    breakdown: {
      fetch_status: { success: '$web_fs_success', blocked: '$web_fs_blocked', failed: '$web_fs_failed', pending: '$web_fs_pending', unprocessed: '$web_fs_unprocessed' },
      refresh_type: { active: '$web_rt_active', static: '$web_rt_static', blocked: '$web_rt_blocked' },
      scrapers: { jina: '$web_scraper_jina', firecrawl: '$web_scraper_firecrawl', raw: '$web_scraper_raw' },
      sitemap_found_count: '$web_sitemap_found_count',
      avg_pages_scraped: '$web_avg_pages_scraped',
    },
  }
}

export type StatsSourceType = 'twitter' | 'rss' | 'website'

/**
 * Builds the Sources-registry-side stats pipeline: the existing generic totals (unchanged), plus
 * a `breakdown` object of type-specific counts when `sourceType` is exactly 'twitter'/'rss'/
 * 'website'. Left undefined for the "All Sources" unfiltered view, where forcing one type's
 * breakdown shape onto mixed rows wouldn't mean anything - that case keeps returning just the
 * generic stats, same as before this feature existed.
 */
export function buildSourcesStatsPipeline(entity: 'company' | 'professional', matchQuery: Record<string, unknown>, sourceType?: StatsSourceType): PipelineStage[] {
  const { entityField } = ENTITY_LOOKUPS[entity]
  const now = new Date()

  const typeGroupFields = sourceType === 'twitter' ? twitterGroupFields(now) : sourceType === 'rss' ? rssGroupFields() : sourceType === 'website' ? websiteGroupFields() : {}
  const typeProjectFields = sourceType === 'twitter' ? twitterProjectFields() : sourceType === 'rss' ? rssProjectFields() : sourceType === 'website' ? websiteProjectFields() : {}

  return [
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        ...DEFAULT_STATS_GROUP,
        ...typeGroupFields,
        unique_entities: { $addToSet: `$${entityField}` },
        unique_source_types: { $addToSet: '$source_type' },
      },
    },
    { $project: { ...DEFAULT_STATS_PROJECT, ...typeProjectFields } },
  ]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

function twitterFeedProject(now: Date): PipelineStage {
  const weekAgo = new Date(now.getTime() - WEEK_MS)
  const yearAgo = new Date(now.getTime() - YEAR_MS)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  return {
    $group: {
      _id: null,
      total_tweets: { $sum: 1 },
      tweets_this_week: { $sum: { $cond: [{ $gte: ['$fetch_date', weekAgo] }, 1, 0] } },
      avg_engagement_rate: { $avg: '$normalized_data.engagement_rate' },
      // Row counts, not distinct-entity counts like the old BigQuery system used - an acceptable
      // simplification for this lighter-weight display stat (see module task spec).
      posted_today: { $sum: { $cond: [{ $gte: ['$normalized_data.posted_at', startOfToday] }, 1, 0] } },
      posted_this_week: { $sum: { $cond: [{ $gte: ['$normalized_data.posted_at', weekAgo] }, 1, 0] } },
      posted_this_month: { $sum: { $cond: [{ $gte: ['$normalized_data.posted_at', new Date(now.getTime() - MONTH_MS)] }, 1, 0] } },
      posted_over_1_year_ago: { $sum: { $cond: [{ $lte: ['$normalized_data.posted_at', yearAgo] }, 1, 0] } },
    },
  }
}

function rssFeedProject(now: Date): PipelineStage {
  const weekAgo = new Date(now.getTime() - WEEK_MS)
  const monthAgo = new Date(now.getTime() - MONTH_MS)

  return {
    $group: {
      _id: null,
      total_posts: { $sum: 1 },
      avg_words_per_post: { $avg: '$normalized_data.word_count' },
      posts_this_week: { $sum: { $cond: [{ $gte: ['$fetch_date', weekAgo] }, 1, 0] } },
      posts_this_month: { $sum: { $cond: [{ $gte: ['$fetch_date', monthAgo] }, 1, 0] } },
    },
  }
}

function websiteFeedProject(now: Date): PipelineStage {
  const weekAgo = new Date(now.getTime() - WEEK_MS)
  const monthAgo = new Date(now.getTime() - MONTH_MS)

  return {
    $group: {
      _id: null,
      avg_word_count: { $avg: '$normalized_data.total_word_count' },
      has_blog: { $sum: { $cond: [{ $eq: ['$normalized_data.has_blog', true] }, 1, 0] } },
      // CONFIRMED FIX: the real field (confirmed against a live BigQuery sample row) is
      // `has_team_page`, not `has_team` - the output breakdown key stays `has_team` for the
      // frontend, only the source field being read was wrong.
      has_team: { $sum: { $cond: [{ $eq: ['$normalized_data.has_team_page', true] }, 1, 0] } },
      has_careers: { $sum: { $cond: [{ $eq: ['$normalized_data.has_careers', true] }, 1, 0] } },
      has_contact: { $sum: { $cond: [{ $eq: ['$normalized_data.has_contact', true] }, 1, 0] } },
      quality_good: { $sum: { $cond: [{ $eq: ['$normalized_data.content_quality', 'good'] }, 1, 0] } },
      quality_partial: { $sum: { $cond: [{ $eq: ['$normalized_data.content_quality', 'partial'] }, 1, 0] } },
      quality_blocked: { $sum: { $cond: [{ $eq: ['$normalized_data.content_quality', 'blocked'] }, 1, 0] } },
      scraped_this_week: { $sum: { $cond: [{ $gte: ['$fetch_date', weekAgo] }, 1, 0] } },
      scraped_this_month: { $sum: { $cond: [{ $gte: ['$fetch_date', monthAgo] }, 1, 0] } },
    },
  }
}

const WEBSITE_FEED_FINAL_PROJECT: PipelineStage = {
  $project: {
    _id: 0,
    avg_word_count: 1,
    content_features: { has_blog: '$has_blog', has_team: '$has_team', has_careers: '$has_careers', has_contact: '$has_contact' },
    quality: { good: '$quality_good', partial: '$quality_partial', blocked: '$quality_blocked' },
    scraped_this_week: 1,
    scraped_this_month: 1,
  },
}

const TWITTER_FEED_FINAL_PROJECT: PipelineStage = {
  $project: {
    _id: 0,
    total_tweets: 1,
    tweets_this_week: 1,
    avg_engagement_rate: 1,
    posting_activity: { posted_today: '$posted_today', posted_this_week: '$posted_this_week', posted_this_month: '$posted_this_month', posted_over_1_year_ago: '$posted_over_1_year_ago' },
  },
}

/**
 * Builds the Feed-collection stats pipeline (CompanyFeedM/ProfessionalFeedM) that supplies the
 * feed-derived numbers (tweet/post/scrape counts and averages) the Sources-registry collection
 * doesn't have. `entityFilter` scopes this to the same entity the sources query matched when an
 * `entityId` was given; otherwise it runs platform-wide, which is an accepted simplification for
 * this lightweight display stat (see module task spec) rather than a precise per-page join.
 */
export function buildFeedStatsPipeline(sourceType: StatsSourceType, entityFilter: Record<string, unknown> = {}): PipelineStage[] {
  const now = new Date()
  const match: PipelineStage = { $match: { source_type: sourceType, ...entityFilter } }

  if (sourceType === 'twitter') return [match, twitterFeedProject(now), TWITTER_FEED_FINAL_PROJECT]
  if (sourceType === 'rss') return [match, rssFeedProject(now)]
  return [match, websiteFeedProject(now), WEBSITE_FEED_FINAL_PROJECT]
}
