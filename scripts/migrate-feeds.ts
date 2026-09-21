// scripts/migrate-feeds.ts
//
// ONE-TIME data migration: pulls the two BigQuery-only tables `Company_Feeds` and
// `Professional_Feeds` (project `for-ga4-bitquery-new`, dataset `qd_cp_app_events` - same
// credentials/project as migrate-sources-urls.ts) into the two new Mongo collections
// (`cln_company_feeds` / `cln_professional_feeds`, see src/modules/sources/sources.feeds.models.ts)
// that back the admin panel's Sources detail view.
//
// This is a READ-ONLY pull from BigQuery and a WRITE into MongoDB - it does not touch BigQuery,
// does not set up any ongoing sync, and is safe to re-run (idempotent upsert keyed by the
// original BigQuery `id`, which is kept verbatim as the Mongo `_id`). Confirmed real scale via a
// sizing query (2026-09-21): 21,453 rows / ~236MB (Company_Feeds), 476 rows / ~9MB
// (Professional_Feeds) - small enough to pull each table in a single query, no pagination needed.
//
// Usage: npx ts-node scripts/migrate-feeds.ts [--dry-run]
//
// Requires: the BigQuery credentials file already present in this repo's root
// (for-ga4-bitquery-new-e971719171c1.json, same one migrate-sources-urls.ts uses) and
// LIVE_MAIN_DB_URL in .env pointing at the target MongoDB.
import path from 'path'
import { BigQuery } from '@google-cloud/bigquery'
import type mongooseType from 'mongoose'

const PROJECT_ID = 'for-ga4-bitquery-new'
const DATASET = 'qd_cp_app_events'
const KEY_FILE = path.join(__dirname, '..', 'for-ga4-bitquery-new-e971719171c1.json')

const DRY_RUN = process.argv.includes('--dry-run')

// Confirmed directly against BigQuery's INFORMATION_SCHEMA (2026-09-21) - `normalized_data`/
// `raw_data` are BigQuery JSON-typed columns but the Node client surfaces them as raw JSON
// strings (confirmed via a real sample row), same situation sources.models.ts's own
// `platform_meta` already handles.
interface BigQueryFeedRow {
  id: string
  company_id?: string | number | null
  professional_id?: string | number | null
  source_type: string
  source_url_id: string | null
  normalized_data: string | Record<string, unknown> | null
  raw_data: string | Record<string, unknown> | null
  fetched_at: { value: string } | string | null
  fetch_date: { value: string } | string | null
}

function toEntityId(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  return typeof value === 'string' ? Number.parseInt(value) : value
}

function toDate(value: { value: string } | string | null | undefined): Date | undefined {
  if (!value) return undefined
  const raw = typeof value === 'string' ? value : value.value
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function parseJsonField(value: string | Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!value) return undefined
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    console.warn(`  ⚠ Could not parse JSON field: ${value.slice(0, 100)}`)
    return undefined
  }
}

async function fetchRows(bigquery: BigQuery, table: string): Promise<BigQueryFeedRow[]> {
  const [rows] = await bigquery.query({
    query: `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${table}\``,
    location: 'us-central1',
  })
  return rows as BigQueryFeedRow[]
}

async function migrateCompanyFeeds(bigquery: BigQuery, CompanyFeedM: any): Promise<number> {
  console.log('📥 Fetching Company_Feeds from BigQuery...')
  const rows = await fetchRows(bigquery, 'Company_Feeds')
  console.log(`  Found ${rows.length} rows`)

  if (DRY_RUN) {
    console.log('  [dry-run] Sample row:', JSON.stringify(rows[0], null, 2).slice(0, 1000))
    return rows.length
  }

  const operations = rows.map((row) => ({
    updateOne: {
      filter: { _id: row.id },
      update: {
        $set: {
          _id: row.id,
          company_id: toEntityId(row.company_id),
          source_type: row.source_type,
          source_url_id: row.source_url_id ?? undefined,
          normalized_data: parseJsonField(row.normalized_data),
          raw_data: parseJsonField(row.raw_data),
          fetched_at: toDate(row.fetched_at),
          fetch_date: toDate(row.fetch_date),
        },
      },
      upsert: true,
    },
  }))

  const BATCH_SIZE = 1000
  let upserted = 0
  let modified = 0
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE)
    const result = await CompanyFeedM.bulkWrite(batch)
    upserted += result.upsertedCount
    modified += result.modifiedCount
    console.log(`  ...batch ${i / BATCH_SIZE + 1}: ${i + batch.length}/${operations.length}`)
  }
  console.log(`  ✅ Upserted ${upserted} new, modified ${modified} existing`)
  return rows.length
}

async function migrateProfessionalFeeds(bigquery: BigQuery, ProfessionalFeedM: any): Promise<number> {
  console.log('📥 Fetching Professional_Feeds from BigQuery...')
  const rows = await fetchRows(bigquery, 'Professional_Feeds')
  console.log(`  Found ${rows.length} rows`)

  if (DRY_RUN) {
    console.log('  [dry-run] Sample row:', JSON.stringify(rows[0], null, 2).slice(0, 1000))
    return rows.length
  }

  const operations = rows.map((row) => ({
    updateOne: {
      filter: { _id: row.id },
      update: {
        $set: {
          _id: row.id,
          professional_id: toEntityId(row.professional_id),
          source_type: row.source_type,
          source_url_id: row.source_url_id ?? undefined,
          normalized_data: parseJsonField(row.normalized_data),
          raw_data: parseJsonField(row.raw_data),
          fetched_at: toDate(row.fetched_at),
          fetch_date: toDate(row.fetch_date),
        },
      },
      upsert: true,
    },
  }))

  const result = await ProfessionalFeedM.bulkWrite(operations)
  console.log(`  ✅ Upserted ${result.upsertedCount} new, modified ${result.modifiedCount} existing`)
  return rows.length
}

async function main() {
  console.log(`🚀 Feeds migration starting${DRY_RUN ? ' (DRY RUN - no writes, no MongoDB connection)' : ''}...`)

  const bigquery = new BigQuery({ projectId: PROJECT_ID, keyFilename: KEY_FILE })

  // Deliberately dynamic imports - see migrate-sources-urls.ts's own comment for why (config/
  // database.js auto-connects to the LIVE database as a side effect of merely being required).
  let CompanyFeedM: any
  let ProfessionalFeedM: any
  let mongoose: typeof mongooseType | undefined

  if (!DRY_RUN) {
    mongoose = require('mongoose')
    await require('../config/database').connectDatabase()
    ;({ CompanyFeedM, ProfessionalFeedM } = require('../src/modules/sources/sources.feeds.models'))
  }

  const companyCount = await migrateCompanyFeeds(bigquery, CompanyFeedM)
  const professionalCount = await migrateProfessionalFeeds(bigquery, ProfessionalFeedM)

  console.log(`\n✅ Done. Company feeds: ${companyCount}, Professional feeds: ${professionalCount}`)

  if (!DRY_RUN && mongoose) {
    await mongoose.connection.close()
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
