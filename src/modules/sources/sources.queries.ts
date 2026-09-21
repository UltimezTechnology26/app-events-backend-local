// modules/sources/sources.queries.ts
// Read-only list/stats pipelines for the Sources admin pages, mirroring the filter set and stats
// shape already established by cp-professionals-companies-events's own BigQuery-reading routes
// (source_type/source_origin/status/is_verified/fetch_status filters, the same stats block) —
// same UX, new backend, reading MongoDB instead of BigQuery.
import { PipelineStage } from 'mongoose'

export interface SourcesFilterParams {
  search?: string
  sourceType?: string
  sourceOrigin?: string
  status?: string
  isVerified?: string
  fetchStatus?: string
  entityId?: string
  sortBy?: string
  order?: string
  // Per-source-type filters (2026-09-21) - see buildSourcesMatchQuery for the exact
  // `platform_meta.*` field each one maps onto.
  tier?: string
  feedType?: string
  refreshType?: string
  scraperUsed?: string
  sitemapFound?: string
}

// `search` is deliberately NOT applied here - it needs to match against the joined entity name
// too (matching the BigQuery route's own behavior), which doesn't exist until after the $lookup
// stage runs later in the pipeline. See buildSearchStage below, applied post-join instead.
export function buildSourcesMatchQuery(params: SourcesFilterParams): Record<string, unknown> {
  // "all" is a real, admin-facing choice (see the frontend's status filter) meaning "don't
  // restrict by status at all" - distinct from omitting the param, which still defaults to
  // "active" (matching the BigQuery route's own default).
  const and: Record<string, unknown>[] = params.status === 'all' ? [] : [{ status: params.status || 'active' }]

  // Supports a comma-separated list (e.g. RSS's "rss,blog") in addition to a single value.
  if (params.sourceType) {
    const types = params.sourceType.split(',').map((t) => t.trim()).filter(Boolean)
    and.push({ source_type: types.length > 1 ? { $in: types } : types[0] })
  }

  if (params.sourceOrigin) and.push({ source_origin: params.sourceOrigin })
  if (params.isVerified === 'true') and.push({ is_verified: true })
  if (params.isVerified === 'false') and.push({ is_verified: false })
  if (params.fetchStatus) and.push({ 'platform_meta.fetch_status': params.fetchStatus })

  // Twitter's tier filter (1-4) - `platform_meta.fetch_tier` is stored as a number, so a
  // non-numeric value is dropped rather than matching nothing via a NaN comparison.
  if (params.tier) {
    const tierNumber = Number(params.tier)
    if (!Number.isNaN(tierNumber)) and.push({ 'platform_meta.fetch_tier': tierNumber })
  }
  // RSS's feed type filter (rss/atom/json_feed).
  if (params.feedType) and.push({ 'platform_meta.feed_type': params.feedType })
  // Website's refresh type (active/static/blocked) and scraper (jina/firecrawl/raw) filters.
  if (params.refreshType) and.push({ 'platform_meta.refresh_type': params.refreshType })
  if (params.scraperUsed) and.push({ 'platform_meta.scraper_used': params.scraperUsed })
  // Website's sitemap-found filter - explicit true/false, same "" means "no filter" convention
  // as isVerified above.
  if (params.sitemapFound === 'true') and.push({ 'platform_meta.sitemap_found': true })
  if (params.sitemapFound === 'false') and.push({ 'platform_meta.sitemap_found': false })

  // A numeric entity id filter (e.g. "?entity_id=5998") is applied here, pre-join - cheap, uses
  // the {company_id:1,status:1}/{professional_id:1,status:1} indexes directly, and lets an admin
  // jump straight to one entity's sources without paying for a name-search join at all.
  const entityIdNumber = params.entityId ? Number.parseInt(params.entityId, 10) : undefined
  if (entityIdNumber !== undefined && !Number.isNaN(entityIdNumber)) {
    and.push({ $or: [{ company_id: entityIdNumber }, { professional_id: entityIdNumber }] })
  }

  return { $and: and }
}

interface EntityLookupConfig {
  entityField: 'company_id' | 'professional_id'
  fromCollection: string
  nameField: string
  imageField: string
}

// Exported so sources.stats.queries.ts can group stats on the same entity field without
// re-declaring this mapping.
export const ENTITY_LOOKUPS: Record<'company' | 'professional', EntityLookupConfig> = {
  company: { entityField: 'company_id', fromCollection: 'cln_company_lists', nameField: 'company_name', imageField: 'company_logo' },
  professional: { entityField: 'professional_id', fromCollection: 'cln_professionals', nameField: 'full_name', imageField: 'profile_image' },
}

function buildEntityLookupStages(entity: 'company' | 'professional'): PipelineStage[] {
  const { entityField, fromCollection, nameField, imageField } = ENTITY_LOOKUPS[entity]
  return [
    {
      $lookup: {
        from: fromCollection,
        localField: entityField,
        foreignField: '_id',
        // Only the two display fields are ever read off the joined document - projecting them
        // inside the $lookup's own sub-pipeline (instead of pulling the whole entity document
        // across just to read 2 fields from it) keeps this join cheap even when it does run
        // across a large candidate set (the search path, below).
        pipeline: [{ $project: { _id: 0, [nameField]: 1, [imageField]: 1 } }],
        as: 'entity_info',
      },
    },
    { $unwind: { path: '$entity_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        entity_name: { $ifNull: [`$entity_info.${nameField}`, null] },
        entity_image: { $ifNull: [`$entity_info.${imageField}`, null] },
      },
    },
  ]
}

// `search` needs to match against the joined entity name too, matching the BigQuery route's own
// behavior (searching source_url/source_type OR the company/professional name) - applied as a
// second $match stage after the join, since entity_name doesn't exist before it.
function buildSearchStage(search: string | undefined): PipelineStage[] {
  if (!search) return []
  const trimmed = search.trim()
  if (!trimmed) return []
  return [
    {
      $match: {
        $or: [
          { source_url: { $regex: trimmed, $options: 'i' } },
          { source_type: { $regex: trimmed, $options: 'i' } },
          { entity_name: { $regex: trimmed, $options: 'i' } },
        ],
      },
    },
  ]
}

// Per-source-type sortable field maps, mirroring the columns the old BigQuery-backed admin panel
// exposed as sortable per source type (each type's real fields live inside the untyped
// `platform_meta` blob, so a flat key like "follower_count" has to be resolved to its actual
// Mongo path). `entity_name` is the one key present in every map since it's a top-level field
// added by the entity $lookup rather than something inside platform_meta.
const SORT_FIELD_MAP: Record<string, Record<string, string>> = {
  twitter: {
    follower_count: 'platform_meta.follower_count',
    fetch_tier: 'platform_meta.fetch_tier',
    last_fetched_at: 'platform_meta.last_fetched_at',
    next_fetch_at: 'platform_meta.next_fetch_at',
    consecutive_empty_runs: 'platform_meta.consecutive_empty_runs',
    posts_fetched_total: 'platform_meta.posts_fetched_total',
    entity_name: 'entity_name',
  },
  rss: {
    posts_fetched_total: 'platform_meta.posts_fetched_total',
    last_fetched_at: 'platform_meta.last_fetched_at',
    next_fetch_at: 'platform_meta.next_fetch_at',
    posts_per_week: 'platform_meta.posts_per_week',
    entity_name: 'entity_name',
  },
  website: {
    pages_scraped: 'platform_meta.pages_scraped',
    last_fetched_at: 'platform_meta.last_fetched_at',
    next_fetch_at: 'platform_meta.next_fetch_at',
    entity_name: 'entity_name',
  },
}

const DEFAULT_SORT_STAGE: Record<string, 1 | -1> = { created_at: -1 }

/**
 * Resolves a request's `sortBy`/`order` params into a Mongo `$sort` expression, falling back to
 * the existing `created_at desc` default whenever `sortBy` is absent, `sourceType` is missing, or
 * the key doesn't exist in that source type's sortable-field map. Sorting by `entity_name`
 * requires the entity $lookup to have already run - callers must check for that key (see
 * `buildSourcesListPipeline`) and join before sorting, same constraint the existing search path
 * already has.
 *
 * A comma-separated `sourceType` (e.g. the RSS admin page's own "rss,blog" filter) resolves off
 * its FIRST token rather than always falling back to the default - "rss,blog" is conceptually one
 * page's worth of RSS-shaped rows (blog is grouped with rss precisely because they share the same
 * `platform_meta` shape), so the RSS sortable-field map still applies. A mix of source types with
 * genuinely different shapes (which this admin panel never actually sends today) would still
 * resolve against the first type's map rather than erroring - an acceptable simplification since
 * no caller combines unrelated types.
 */
export function resolveSortStage(params: SourcesFilterParams): Record<string, 1 | -1> {
  if (!params.sortBy || !params.sourceType) return DEFAULT_SORT_STAGE

  const primaryType = params.sourceType.split(',')[0]?.trim()
  const fieldMap = primaryType ? SORT_FIELD_MAP[primaryType] : undefined
  const field = fieldMap?.[params.sortBy]
  if (!field) return DEFAULT_SORT_STAGE

  const direction: 1 | -1 = params.order === 'asc' ? 1 : -1
  return { [field]: direction }
}

const PROJECT_STAGE: PipelineStage = {
  $project: {
    _id: 1,
    company_id: 1,
    professional_id: 1,
    entity_name: 1,
    entity_image: 1,
    source_type: 1,
    source_url: 1,
    source_origin: 1,
    is_custom_url: 1,
    is_verified: 1,
    is_current_position: 1,
    added_by_admin: 1,
    added_date: 1,
    user_notes: 1,
    status: 1,
    created_at: 1,
    updated_at: 1,
    platform_meta: 1,
  },
}

/**
 * CONFIRMED PERF FIX (2026-09-17, found during live UI verification - not a pre-existing bug,
 * this session's own first draft had it): the entity $lookup previously ran on the FULL matched
 * set before $sort/$skip/$limit, meaning every request paid for a join against
 * cln_company_lists/cln_professionals for every matching row (thousands, at this collection's
 * size) just to return one page of 50. Reordered so the expensive join only ever runs against
 * the page actually being returned - the common case (browsing without a search term) never
 * joins more than `limit` rows.
 *
 * The search path is the one case that still has to join before paginating, since matching on
 * entity_name requires it to exist first - accepted as the costlier path since it only runs when
 * an admin is actively searching by name, not on every plain page load. A numeric `entityId`
 * filter (see buildSourcesMatchQuery) sidesteps this entirely by matching pre-join.
 */
export function buildSourcesListPipeline(entity: 'company' | 'professional', matchQuery: Record<string, unknown>, params: SourcesFilterParams, skip: number, limit: number): PipelineStage[] {
  const sortStage = resolveSortStage(params)
  // Sorting by `entity_name` has the exact same join-before-paginate constraint as searching by
  // name (see the perf-fix comment above) - the field doesn't exist until after the $lookup runs.
  const sortNeedsEntityJoin = Object.prototype.hasOwnProperty.call(sortStage, 'entity_name')

  if (params.search || sortNeedsEntityJoin) {
    return [
      { $match: matchQuery },
      ...buildEntityLookupStages(entity),
      ...buildSearchStage(params.search),
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit },
      PROJECT_STAGE,
    ]
  }

  return [
    { $match: matchQuery },
    { $sort: sortStage },
    { $skip: skip },
    { $limit: limit },
    ...buildEntityLookupStages(entity),
    PROJECT_STAGE,
  ]
}

export function buildSourcesCountPipeline(entity: 'company' | 'professional', matchQuery: Record<string, unknown>, params: SourcesFilterParams): PipelineStage[] {
  if (!params.search) {
    return [{ $match: matchQuery }, { $count: 'count' }]
  }

  return [
    { $match: matchQuery },
    ...buildEntityLookupStages(entity),
    ...buildSearchStage(params.search),
    { $count: 'count' },
  ]
}

// Re-exported for backward compatibility - the stats pipeline builders live in
// sources.stats.queries.ts (kept as a separate file per this module's own file-size discipline;
// sources.queries.ts was already at ~180 lines before the sort-support work above), but existing
// callers/tests import them from here.
export { buildSourcesStatsPipeline, buildFeedStatsPipeline } from './sources.stats.queries'
