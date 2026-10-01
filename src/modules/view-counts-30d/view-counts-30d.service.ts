// modules/view-counts-30d/view-counts-30d.service.ts
//
// Orchestrates the on-demand cache-aside flow (see view-counts-30d.cache.ts's own doc comment for
// why on-demand instead of a fixed cron). `getViewCounts30d` is the only export other modules call.
import { ProfessionalM } from '../professionals/professionals.models'
const companyM = require('../../../models/app/company/companyM')
const eventM = require('../../../models/app/events/eventM')
import { fetchViewCounts30dFromBigQuery } from './view-counts-30d.bigquery'
import { isDatasetFresh, markDatasetPopulated, getEntityViewCount, setEntityViewCounts, tryAcquireRefreshLock } from './view-counts-30d.cache'
import { ViewCountEntityType } from './view-counts-30d.types'

/**
 * Professional profile pages sit at the app's bare root (`/<username>/`, no distinguishing path
 * prefix - confirmed elsewhere in this codebase, e.g. visitors-overview.bigquery.server.ts's own
 * doc comment) - unlike Company's unambiguous `/company/<slug>/`. BigQuery has no way to tell a
 * real username apart from `/about`, `/blog`, `/admin`, etc. by the URL alone, so this cross-
 * references every root-level path segment GA4 saw against the real, current list of professional
 * usernames from MongoDB and discards everything that isn't a match.
 */
async function resolveProfessionalRootSegments(rootCounts: Record<string, number>): Promise<Record<string, number>> {
  const realUsernames: string[] = await ProfessionalM.distinct('user_name', { user_name: { $exists: true, $ne: null } })
  const realUsernameSet = new Set(realUsernames.map((name) => name.toLowerCase()))

  const resolved: Record<string, number> = {}
  for (const [segment, views] of Object.entries(rootCounts)) {
    const normalized = segment.toLowerCase()
    if (realUsernameSet.has(normalized)) {
      resolved[normalized] = views
    }
  }
  return resolved
}

/**
 * Events pages live on a different domain (events.coinpedia.org) than Company/Professional
 * (app.coinpedia.org), and that domain's own root-level routes (frontend-events-typescript's
 * /all-events, /create-event, /organizers, /speakers, /my-events, etc.) are exactly as ambiguous
 * as app.coinpedia.org's root segments are for professional usernames - resolved the same way,
 * against the real event_url list from MongoDB.
 */
async function resolveEventUrlSegments(eventCounts: Record<string, number>): Promise<Record<string, number>> {
  const realEventUrls: string[] = await eventM.distinct('event_url', { event_url: { $exists: true, $ne: null } })
  const realEventUrlSet = new Set(realEventUrls.map((url) => url.toLowerCase()))

  const resolved: Record<string, number> = {}
  for (const [segment, views] of Object.entries(eventCounts)) {
    const normalized = segment.toLowerCase()
    if (realEventUrlSet.has(normalized)) {
      resolved[normalized] = views
    }
  }
  return resolved
}

async function resolveCompanySlugs(companyCounts: Record<string, number>): Promise<Record<string, number>> {
  const realCompanyIds: string[] = await companyM.distinct('company_id', { company_id: { $exists: true, $ne: null } })
  const realCompanyIdSet = new Set(realCompanyIds.map((id) => id.toLowerCase()))

  const resolved: Record<string, number> = {}
  for (const [slug, views] of Object.entries(companyCounts)) {
    const normalized = slug.toLowerCase()
    if (realCompanyIdSet.has(normalized)) {
      resolved[normalized] = views
    }
  }
  return resolved
}

/**
 * Runs the one combined BigQuery scan, resolves both entity types against MongoDB, and writes
 * every result into the per-entity cache plus the "populated" marker in one pass - since the scan
 * cost is fixed regardless of scope (see the .bigquery.ts module's own doc comment), there's no
 * benefit to populating only a subset.
 */
async function repopulateFromBigQuery(): Promise<void> {
  const rows = await fetchViewCounts30dFromBigQuery()

  const companyCounts: Record<string, number> = {}
  const rootCounts: Record<string, number> = {}
  const eventCounts: Record<string, number> = {}
  for (const row of rows) {
    if (!row.key) continue
    const views = Number(row.views) || 0
    if (row.kind === 'company') companyCounts[row.key] = views
    else if (row.kind === 'event') eventCounts[row.key] = views
    else rootCounts[row.key] = views
  }

  const [resolvedCompanyCounts, resolvedProfessionalCounts, resolvedEventCounts] = await Promise.all([
    resolveCompanySlugs(companyCounts),
    resolveProfessionalRootSegments(rootCounts),
    resolveEventUrlSegments(eventCounts),
  ])

  await Promise.all([
    setEntityViewCounts('company', resolvedCompanyCounts),
    setEntityViewCounts('professional', resolvedProfessionalCounts),
    setEntityViewCounts('event', resolvedEventCounts),
  ])
  await markDatasetPopulated()
}

/**
 * Ensures the cache is fresh (triggering exactly one BigQuery scan if it's stale/empty, guarded by
 * a soft lock so concurrent requests don't each trigger their own scan), then returns the requested
 * identifiers' view counts. An identifier with no cached value (a brand-new company/professional,
 * or genuinely zero GA4 hits) resolves to 0, never throws, and never blocks the caller on a second
 * scan attempt if the lock is already held elsewhere.
 */
export async function getViewCounts30d(entityType: ViewCountEntityType, identifiers: string[]): Promise<Record<string, number>> {
  const fresh = await isDatasetFresh()
  if (!fresh) {
    const acquired = await tryAcquireRefreshLock()
    if (acquired) {
      try {
        await repopulateFromBigQuery()
      } catch (err) {
        console.log('view-counts-30d: BigQuery repopulate failed.', err instanceof Error ? err.message : err)
      }
    }
    // If the lock was already held, another request is repopulating right now - fall through and
    // serve whatever is already cached (possibly stale-but-present, or 0s on a true cold start)
    // rather than making this request wait on a second scan.
  }

  const result: Record<string, number> = {}
  await Promise.all(
    identifiers.map(async (identifier) => {
      const count = await getEntityViewCount(entityType, identifier)
      result[identifier.toLowerCase()] = count ?? 0
    }),
  )
  return result
}
