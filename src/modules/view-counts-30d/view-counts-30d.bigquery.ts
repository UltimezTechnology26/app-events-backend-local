// modules/view-counts-30d/view-counts-30d.bigquery.ts
//
// ONE BigQuery scan backs both the Company and Professional "Views (Last 30 Days)" columns
// (user-requested, 2026-09-22). Cost is dominated by scanning the last 30 days of raw GA4 events
// (~1.05GB / ~3.3s measured directly against production data), not by how many distinct paths end
// up in the grouped output - so this deliberately computes BOTH company slugs and root-level path
// segments (candidate professional usernames + noise) from the SAME `base` CTE in one query,
// instead of two separate queries that would each pay the same scan cost again.
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
  `
}

/** Runs the single combined 30-day scan. Callers split `kind: 'root'` rows against the real professional username list themselves (this module has no Mongo access, per module-boundary convention). */
export async function fetchViewCounts30dFromBigQuery(): Promise<ViewCountBigQueryRow[]> {
  const bigquery = getBigQueryClient()
  const [rows] = await bigquery.query({ query: buildQuery(), location: 'US' })
  return rows as ViewCountBigQueryRow[]
}
