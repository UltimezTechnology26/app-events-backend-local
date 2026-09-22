// modules/view-counts-30d/view-counts-30d.cache.ts
//
// On-demand cache-aside for the 30-day view-count feature (user-requested, 2026-09-22, after
// weighing a fixed cron against on-demand repopulation on cost grounds - the BigQuery scan costs
// the same either way, so on-demand never costs more and often costs less since it skips windows
// with no real admin activity). A single "populated marker" key stands in for "every company's and
// every professional's count is fresh" - checking one key is far cheaper than checking thousands
// of per-entity keys on every list-page load. Per-entity keys still exist individually so a
// specific lookup doesn't need to load the entire dataset into memory.
import { getCache, setCache } from '@ultimez-interview/coinpedia-backend-library/cache'
import { ViewCountEntityType } from './view-counts-30d.types'

const POPULATED_MARKER_KEY = 'view_counts_30d:populated_at'
const LOCK_KEY = 'view_counts_30d:refresh_lock'
const ENTITY_TTL_SECONDS = 24 * 60 * 60
const LOCK_TTL_SECONDS = 60

function entityKey(entityType: ViewCountEntityType, identifier: string): string {
  return `view_count_30d:${entityType}:${identifier.toLowerCase()}`
}

export async function isDatasetFresh(): Promise<boolean> {
  const result = await getCache({ key: POPULATED_MARKER_KEY })
  return result.status
}

export async function markDatasetPopulated(): Promise<void> {
  await setCache({ key: POPULATED_MARKER_KEY, value: { populated_at: new Date().toISOString() }, ttl: ENTITY_TTL_SECONDS })
}

export async function getEntityViewCount(entityType: ViewCountEntityType, identifier: string): Promise<number | null> {
  const result = await getCache({ key: entityKey(entityType, identifier) })
  const message = result.message as { views?: unknown } | null
  if (!result.status || typeof message?.views !== 'number') return null
  return message.views
}

export async function setEntityViewCounts(entityType: ViewCountEntityType, counts: Record<string, number>): Promise<void> {
  const entries = Object.entries(counts)
  await Promise.all(entries.map(([identifier, views]) => setCache({ key: entityKey(entityType, identifier), value: { views }, ttl: ENTITY_TTL_SECONDS })))
}

/**
 * Soft (non-atomic) lock: two requests racing within the same few milliseconds could both pass
 * this check before either writes the lock, occasionally causing two BigQuery scans instead of
 * one. Accepted trade-off - the shared cache library doesn't expose a raw SET NX primitive, and
 * the failure mode (rare, occasional double-cost, never wrong data) doesn't justify a second,
 * separate Redis connection just to get atomic locking for this one low-stakes case.
 */
export async function tryAcquireRefreshLock(): Promise<boolean> {
  const existing = await getCache({ key: LOCK_KEY })
  if (existing.status) return false
  await setCache({ key: LOCK_KEY, value: { locked: true }, ttl: LOCK_TTL_SECONDS })
  return true
}
