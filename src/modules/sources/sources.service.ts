// modules/sources/sources.service.ts
// Read-only Sources admin API - backs the "Sources" admin panel section (All/Twitter/Website/RSS
// x Companies/Professionals), migrated off cp-professionals-companies-events's BigQuery-only
// tables per the user's explicit request: display from MongoDB only, no write path here.
import { CompanySourceUrlM, ProfessionalSourceUrlM } from './sources.models'
import { CompanyFeedM, ProfessionalFeedM } from './sources.feeds.models'
import { buildSourcesMatchQuery, buildSourcesListPipeline, buildSourcesCountPipeline, buildSourcesStatsPipeline, buildFeedStatsPipeline, SourcesFilterParams } from './sources.queries'
import { buildTwitterEntityFeedAveragesPipeline, buildWebsiteEntityLatestFeedPipeline, buildRssEntityFeedStatsPipeline } from './sources.feeds.queries'
import { StatsSourceType } from './sources.stats.queries'
import { getCache, setCache, buildSourcesListKey, SOURCES_LIST_CACHE_TTL_SECONDS } from './sources.cache'
import { SourcesListParams } from './sources.types'

const STATS_SOURCE_TYPES: StatsSourceType[] = ['twitter', 'rss', 'website']

function parsePaging(skipRaw: string, limitRaw: string): { skip: number; limit: number } {
  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50
  return { skip, limit }
}

function toFilterParams(params: SourcesListParams): SourcesFilterParams {
  return {
    search: params.search,
    sourceType: params.sourceType,
    sourceOrigin: params.sourceOrigin,
    status: params.status,
    isVerified: params.isVerified,
    fetchStatus: params.fetchStatus,
    entityId: params.entityId,
    sortBy: params.sortBy,
    order: params.order,
    tier: params.tier,
    feedType: params.feedType,
    refreshType: params.refreshType,
    scraperUsed: params.scraperUsed,
    sitemapFound: params.sitemapFound,
  }
}

// A per-source-type stats breakdown only makes sense for a single, known source type (not the
// "All Sources" unfiltered view, and not a comma-separated multi-type filter like "rss,blog").
function resolveStatsSourceType(sourceType: string | undefined): StatsSourceType | undefined {
  if (!sourceType || sourceType.includes(',')) return undefined
  return STATS_SOURCE_TYPES.includes(sourceType as StatsSourceType) ? (sourceType as StatsSourceType) : undefined
}

// Scopes the feed-stats query to the same single entity the sources query was scoped to (via
// `?entity_id=`), so a company/professional detail page's stats stay specific to that entity
// rather than mixing in platform-wide feed volume.
function buildFeedEntityFilter(entity: 'company' | 'professional', entityId: string | undefined): Record<string, number> {
  const idNumber = entityId ? Number.parseInt(entityId, 10) : undefined
  if (idNumber === undefined || Number.isNaN(idNumber)) return {}
  return entity === 'company' ? { company_id: idNumber } : { professional_id: idNumber }
}

function defaultGenericStats() {
  return {
    total_sources: 0, manual_sources: 0, database_sources: 0, generated_sources: 0,
    verified_sources: 0, unique_entities_count: 0, unique_source_types_count: 0,
  }
}

// CONFIRMED BUG FIX (found live, 2026-09-21): a MongoDB `$group: {_id: null, ...}` aggregation
// produces ZERO output documents when its input is empty (e.g. the Feeds collections before the
// historical backfill runs, or a single entity/source that's never been fetched yet) - not one
// document with every counter at 0. Without this default, `feedStatsResult[0] || {}` silently
// dropped every feed-derived field (posting_activity, total_tweets, etc.) from `breakdown`
// entirely, and the frontend's `SourcesTypeBreakdown.tsx` crashed reading e.g.
// `breakdown.posting_activity.posted_today` on undefined. Shapes below mirror
// sources.stats.queries.ts's own *_FEED_FINAL_PROJECT outputs exactly.
function defaultFeedStats(sourceType: StatsSourceType): Record<string, unknown> {
  if (sourceType === 'twitter') {
    return {
      total_tweets: 0,
      tweets_this_week: 0,
      avg_engagement_rate: 0,
      posting_activity: { posted_today: 0, posted_this_week: 0, posted_this_month: 0, posted_over_1_year_ago: 0 },
    }
  }
  if (sourceType === 'rss') {
    return { total_posts: 0, avg_words_per_post: 0, posts_this_week: 0, posts_this_month: 0 }
  }
  return {
    avg_word_count: 0,
    content_features: { has_blog: 0, has_team: 0, has_careers: 0, has_contact: 0 },
    quality: { good: 0, partial: 0, blocked: 0 },
    scraped_this_week: 0,
    scraped_this_month: 0,
  }
}

interface TwitterFeedAverageRow {
  _id: number
  avg_engagement_rate: number | null
  avg_likes: number | null
  last_posted_at: string | null
}

/**
 * Merges each row's own per-entity Twitter feed averages (Engagement/Avg Likes/Last Posted) onto
 * the already-fetched page of Sources-registry rows - a single extra aggregate scoped to just this
 * page's entity ids, not a per-row query (see buildTwitterEntityFeedAveragesPipeline's own doc
 * comment). No-op (returns `list` unchanged) for anything other than the Twitter page, since these
 * fields only make sense for that source type.
 */
async function enrichTwitterRowsWithFeedAverages(
  entity: 'company' | 'professional',
  FeedModel: typeof CompanyFeedM | typeof ProfessionalFeedM,
  list: Record<string, unknown>[],
  statsSourceType: StatsSourceType | undefined,
): Promise<Record<string, unknown>[]> {
  if (statsSourceType !== 'twitter' || list.length === 0) return list

  const entityField = entity === 'company' ? 'company_id' : 'professional_id'
  const entityIds = [...new Set(list.map((row) => row[entityField] as number).filter((id) => typeof id === 'number'))]
  if (entityIds.length === 0) return list

  const averages: TwitterFeedAverageRow[] = await FeedModel.aggregate(buildTwitterEntityFeedAveragesPipeline(entityField, entityIds))
  const averagesById = new Map(averages.map((row) => [row._id, row]))

  return list.map((row) => {
    const average = averagesById.get(row[entityField] as number)
    return {
      ...row,
      avg_engagement_rate: average?.avg_engagement_rate ?? null,
      avg_likes: average?.avg_likes ?? null,
      last_posted_at: average?.last_posted_at ?? null,
    }
  })
}

interface WebsiteLatestFeedRow {
  _id: number
  total_word_count: number | null
  content_quality: string | null
  has_blog: boolean | null
  has_team_page: boolean | null
  has_careers: boolean | null
  has_contact: boolean | null
  has_faq: boolean | null
}

/**
 * Merges each row's own per-entity Website "latest scrape session" fields (Words/Quality/
 * Features) onto the already-fetched page of Sources-registry rows - same "one extra aggregate
 * scoped to this page's entity ids" shape as `enrichTwitterRowsWithFeedAverages`, but a $first-
 * after-$sort "latest" read instead of an average (see
 * `buildWebsiteEntityLatestFeedPipeline`'s own doc comment for why). No-op for anything other than
 * the Website page.
 */
async function enrichWebsiteRowsWithLatestFeed(
  entity: 'company' | 'professional',
  FeedModel: typeof CompanyFeedM | typeof ProfessionalFeedM,
  list: Record<string, unknown>[],
  statsSourceType: StatsSourceType | undefined,
): Promise<Record<string, unknown>[]> {
  if (statsSourceType !== 'website' || list.length === 0) return list

  const entityField = entity === 'company' ? 'company_id' : 'professional_id'
  const entityIds = [...new Set(list.map((row) => row[entityField] as number).filter((id) => typeof id === 'number'))]
  if (entityIds.length === 0) return list

  const latest: WebsiteLatestFeedRow[] = await FeedModel.aggregate(buildWebsiteEntityLatestFeedPipeline(entityField, entityIds))
  const latestById = new Map(latest.map((row) => [row._id, row]))

  return list.map((row) => {
    const feed = latestById.get(row[entityField] as number)
    return {
      ...row,
      total_word_count: feed?.total_word_count ?? null,
      content_quality: feed?.content_quality ?? null,
      has_blog: feed?.has_blog ?? null,
      has_team_page: feed?.has_team_page ?? null,
      has_careers: feed?.has_careers ?? null,
      has_contact: feed?.has_contact ?? null,
      has_faq: feed?.has_faq ?? null,
    }
  })
}

interface RssFeedStatsRow {
  _id: number
  avg_words: number | null
  total_posts: number | null
  latest_post_title: string | null
  latest_post_date: string | null
}

/**
 * Merges each row's own per-entity RSS feed stats (Avg Words/Total Posts/Latest Post) onto the
 * already-fetched page of Sources-registry rows - same "one extra aggregate scoped to this page's
 * entity ids" shape as Twitter/Website's own enrichment functions. No-op for anything other than
 * the RSS page.
 */
async function enrichRssRowsWithFeedStats(
  entity: 'company' | 'professional',
  FeedModel: typeof CompanyFeedM | typeof ProfessionalFeedM,
  list: Record<string, unknown>[],
  statsSourceType: StatsSourceType | undefined,
): Promise<Record<string, unknown>[]> {
  if (statsSourceType !== 'rss' || list.length === 0) return list

  const entityField = entity === 'company' ? 'company_id' : 'professional_id'
  const entityIds = [...new Set(list.map((row) => row[entityField] as number).filter((id) => typeof id === 'number'))]
  if (entityIds.length === 0) return list

  const stats: RssFeedStatsRow[] = await FeedModel.aggregate(buildRssEntityFeedStatsPipeline(entityField, entityIds))
  const statsById = new Map(stats.map((row) => [row._id, row]))

  return list.map((row) => {
    const feedStats = statsById.get(row[entityField] as number)
    return {
      ...row,
      avg_words: feedStats?.avg_words ?? null,
      total_posts: feedStats?.total_posts ?? null,
      latest_post_title: feedStats?.latest_post_title ?? null,
      latest_post_date: feedStats?.latest_post_date ?? null,
    }
  })
}

async function getSourcesList(entity: 'company' | 'professional', params: SourcesListParams) {
  const { skip, limit } = parsePaging(params.skipRaw, params.limitRaw)
  const filterParams = toFilterParams(params)

  const cacheKey = buildSourcesListKey(entity, skip, limit, {
    search: filterParams.search,
    source_type: filterParams.sourceType,
    source_origin: filterParams.sourceOrigin,
    status: filterParams.status,
    is_verified: filterParams.isVerified,
    fetch_status: filterParams.fetchStatus,
    entity_id: filterParams.entityId,
    sort_by: filterParams.sortBy,
    order: filterParams.order,
    tier: filterParams.tier,
    feed_type: filterParams.feedType,
    refresh_type: filterParams.refreshType,
    scraper_used: filterParams.scraperUsed,
    sitemap_found: filterParams.sitemapFound,
  })
  const cached = await getCache({ key: cacheKey })
  if (cached.status) return { ...(cached.message as object), cache_reponse_status: true }

  const matchQuery = buildSourcesMatchQuery(filterParams)
  const Model = entity === 'company' ? CompanySourceUrlM : ProfessionalSourceUrlM
  const FeedModel = entity === 'company' ? CompanyFeedM : ProfessionalFeedM

  const statsSourceType = resolveStatsSourceType(filterParams.sourceType)

  const [list, countResult, statsResult, feedStatsResult] = await Promise.all([
    Model.aggregate(buildSourcesListPipeline(entity, matchQuery, filterParams, skip, limit)),
    Model.aggregate(buildSourcesCountPipeline(entity, matchQuery, filterParams)),
    Model.aggregate(buildSourcesStatsPipeline(entity, matchQuery, statsSourceType)),
    // Only the sources collection has a matchQuery to scope against - skip the feed collection
    // entirely for the "All Sources" / multi-type views where no single-type breakdown applies.
    statsSourceType ? FeedModel.aggregate(buildFeedStatsPipeline(statsSourceType, buildFeedEntityFilter(entity, filterParams.entityId))) : Promise.resolve([]),
  ])

  const sourceStats = statsResult[0] || defaultGenericStats()
  const stats = statsSourceType
    ? { ...sourceStats, breakdown: { ...(sourceStats.breakdown || {}), ...defaultFeedStats(statsSourceType), ...(feedStatsResult[0] || {}) } }
    : sourceStats

  const twitterEnrichedList = await enrichTwitterRowsWithFeedAverages(entity, FeedModel, list, statsSourceType)
  const websiteEnrichedList = await enrichWebsiteRowsWithLatestFeed(entity, FeedModel, twitterEnrichedList, statsSourceType)
  const enrichedList = await enrichRssRowsWithFeedStats(entity, FeedModel, websiteEnrichedList, statsSourceType)

  const result = {
    status: true,
    message: enrichedList,
    count: countResult[0]?.count || 0,
    stats,
  }

  await setCache({ key: cacheKey, value: result, ttl: SOURCES_LIST_CACHE_TTL_SECONDS })
  return { ...result, cache_reponse_status: false }
}

export function getCompanySourcesList(params: SourcesListParams) {
  return getSourcesList('company', params)
}

export function getProfessionalSourcesList(params: SourcesListParams) {
  return getSourcesList('professional', params)
}
