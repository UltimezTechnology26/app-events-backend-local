// modules/view-counts-30d/view-counts-30d.bigquery.ts
//
// ONE BigQuery scan backs the Company, Professional, AND Events "Views (Last 30 Days)" columns
// (user-requested, 2026-09-22 for company/professional; extended 2026-09-23 for events, per the
// Events migration plan's decision to reuse this exact module rather than build a separate one).
// Cost is dominated by scanning the last 30 days of raw GA4 events (~1.05GB / ~3.3s measured
// directly against production data), not by how many distinct paths end up in the grouped output
// - so this deliberately computes company slugs, candidate professional usernames, AND candidate
// event URL slugs from the SAME `base` CTE in one query, instead of separate queries that would
// each pay the same scan cost again.
//
// Events pages live on a DIFFERENT domain than Company/Professional (confirmed via
// utils/helpers/app_helper.js/events_helper.js's own hardcoded email links: public event pages
// are `https://events.coinpedia.org/<event_url>`, not `app.coinpedia.org/...`). Root-level path
// segments on events.coinpedia.org are ambiguous the same way professional usernames are on
// app.coinpedia.org (frontend-events-typescript's own route list includes non-event pages at the
// root: /all-events, /create-event, /organizers, /speakers, /my-events) - resolved against the
// real event_url list from MongoDB in view-counts-30d.service.ts, same pattern as professional
// username resolution.
import { BigQuery } from '@google-cloud/bigquery'
import { ViewCountBigQueryRow } from './view-counts-30d.types'

const GA4_PROJECT_ID = 'for-ga4-bitquery-new'
const GA4_EVENTS_TABLE = 'for-ga4-bitquery-new.analytics_308621177.events_*'
const WINDOW_DAYS = 30

let cachedClient: BigQuery | null = null

/**
 * Matches `config/bigquery-database-helper.js`'s own credential resolution exactly: on this
 * backend (unlike the frontend's own BigQuery client), `GOOGLE_APPLICATION_CREDENTIALS` is a bare
 * key-file NAME (e.g. `for-ga4-bitquery-new-e971719171c1.json`), passed as `keyFilename`, not a
 * JSON blob to `JSON.parse` - confirmed by the exact same value already hardcoded across every
 * config in `config/bigquery-tables.js`.
 */
function getBigQueryClient(): BigQuery {
  if (cachedClient) return cachedClient
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyFilename) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not configured for the view-counts-30d module')
  }
  cachedClient = new BigQuery({ projectId: GA4_PROJECT_ID, keyFilename })
  return cachedClient
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function buildQuery(): string {
  const today = new Date()
  const start = new Date(today.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

  return `
    WITH base AS (
      SELECT
        COALESCE(
          (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location' LIMIT 1),
          (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_path' LIMIT 1)
        ) AS page_location
      FROM \`${GA4_EVENTS_TABLE}\`
      WHERE _TABLE_SUFFIX BETWEEN '${formatDate(start)}' AND '${formatDate(today)}'
        AND event_name = 'page_view'
    ),
    filtered AS (
      SELECT page_location FROM base WHERE page_location LIKE '%app.coinpedia.org/%'
    ),
    company_paths AS (
      SELECT REGEXP_EXTRACT(page_location, r'app\\.coinpedia\\.org/company/([^/?]+)') AS slug
      FROM filtered
      WHERE REGEXP_CONTAINS(page_location, r'app\\.coinpedia\\.org/company/[^/?]+')
    ),
    root_paths AS (
      SELECT REGEXP_EXTRACT(page_location, r'app\\.coinpedia\\.org/([^/?]+)') AS segment
      FROM filtered
      WHERE NOT REGEXP_CONTAINS(page_location, r'app\\.coinpedia\\.org/company/')
    ),
    events_filtered AS (
      SELECT page_location FROM base WHERE page_location LIKE '%events.coinpedia.org/%'
    ),
    event_paths AS (
      SELECT REGEXP_EXTRACT(page_location, r'events\\.coinpedia\\.org/([^/?]+)') AS segment
      FROM events_filtered
    )
    SELECT 'company' AS kind, slug AS key, COUNT(*) AS views
    FROM company_paths
    WHERE slug IS NOT NULL
    GROUP BY slug
    UNION ALL
    SELECT 'root' AS kind, segment AS key, COUNT(*) AS views
    FROM root_paths
    WHERE segment IS NOT NULL
    GROUP BY segment
    UNION ALL
    SELECT 'event' AS kind, segment AS key, COUNT(*) AS views
    FROM event_paths
    WHERE segment IS NOT NULL
    GROUP BY segment
  `
}

/** Runs the single combined 30-day scan. Callers split `kind: 'root'` rows against the real professional username list themselves (this module has no Mongo access, per module-boundary convention). */
export async function fetchViewCounts30dFromBigQuery(): Promise<ViewCountBigQueryRow[]> {
  const bigquery = getBigQueryClient()
  const [rows] = await bigquery.query({ query: buildQuery(), location: 'US' })
  return rows as ViewCountBigQueryRow[]
}
