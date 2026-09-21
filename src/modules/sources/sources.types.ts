// modules/sources/sources.types.ts

export interface AdminAuthFailure {
  status: false
  message: unknown
}

export interface AdminAuthSuccess {
  status: true
  message: unknown
}

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure

export interface SourcesListParams {
  skipRaw: string
  limitRaw: string
  search?: string
  sourceType?: string
  sourceOrigin?: string
  status?: string
  isVerified?: string
  fetchStatus?: string
  entityId?: string
  sortBy?: string
  order?: string
  // Per-source-type filters (2026-09-21): Twitter's tier, RSS's feed type, and Website's
  // refresh type/scraper/sitemap-found - see sources.queries.ts's buildSourcesMatchQuery for how
  // each maps onto its real `platform_meta.*` field.
  tier?: string
  feedType?: string
  refreshType?: string
  scraperUsed?: string
  sitemapFound?: string
}

export const SOURCE_TYPES = ['website', 'rss', 'blog', 'twitter', 'linkedin', 'facebook', 'instagram', 'telegram', 'reddit', 'medium'] as const
