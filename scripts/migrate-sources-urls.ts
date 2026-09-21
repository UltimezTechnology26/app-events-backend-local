// scripts/migrate-sources-urls.ts
//
// ONE-TIME data migration: pulls the two BigQuery-only tables `Company_Sources_Urls` and
// `Professional_Sources_Urls` (project `for-ga4-bitquery-new`, dataset `qd_cp_app_events` - the
// real source of truth, confirmed via cp-professionals-companies-events's own
// `@ultimez-interview/shared/lib/bigquery.ts`) into the two new Mongo collections
// (`cln_company_source_urls` / `cln_professional_source_urls`, see
// src/modules/sources/sources.models.ts) that now back the admin panel's "Sources" section.
//
// This is a READ-ONLY pull from BigQuery and a WRITE into MongoDB - it does not touch BigQuery,
// does not set up any ongoing sync, and is safe to re-run (idempotent upsert keyed by the
// original BigQuery `id`, which is kept verbatim as the Mongo `_id`).
//
// Usage: npx ts-node scripts/migrate-sources-urls.ts [--dry-run]
//
// Requires: the BigQuery credentials file already present in this repo's root
// (for-ga4-bitquery-new-e971719171c1.json, same project the frontend's own BigQuery client uses)
// and LIVE_MAIN_DB_URL in .env pointing at the target MongoDB.
import path from 'path'
import { BigQuery } from '@google-cloud/bigquery'
import type mongooseType from 'mongoose'

const PROJECT_ID = 'for-ga4-bitquery-new'
const DATASET = 'qd_cp_app_events'
const KEY_FILE = path.join(__dirname, '..', 'for-ga4-bitquery-new-e971719171c1.json')

const DRY_RUN = process.argv.includes('--dry-run')

// Field set confirmed directly against BigQuery's INFORMATION_SCHEMA (not assumed from the
// frontend's own read routes, which don't select every column) - Company_Sources_Urls and
// Professional_Sources_Urls are NOT perfectly symmetric: only Company_Sources_Urls has
// `is_verified`, only Professional_Sources_Urls has `is_current_position`, and `added_by_admin`
// is a STRING on both (not a boolean, despite the name).
interface BigQuerySourceRow {
  id: string
  company_id?: string | number | null
  professional_id?: string | number | null
  source_type: string
  source_url: string | null
  source_origin: string | null
  is_custom_url: boolean | null
  is_verified?: boolean | null
  added_by_admin: string | null
  added_date: { value: string } | string | null
  user_notes: string | null
  status: string | null
  is_current_position?: boolean | null
  created_at: { value: string } | string | null
  updated_at: { value: string } | string | null
  platform_meta: string | Record<string, unknown> | null
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

// platform_meta is stored as a JSON string in BigQuery (read via JSON_VALUE in every existing
// route) - parse it into a real object for Mongo; if it's already an object (BigQuery's client
// can auto-parse JSON-typed columns), pass it through as-is.
function parsePlatformMeta(value: string | Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!value) return undefined
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    console.warn(`  ⚠ Could not parse platform_meta JSON: ${value.slice(0, 100)}`)
    return undefined
  }
}

async function fetchRows(bigquery: BigQuery, table: string): Promise<BigQuerySourceRow[]> {
  const [rows] = await bigquery.query({
    query: `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${table}\``,
    location: 'us-central1',
  })
  return rows as BigQuerySourceRow[]
}

async function migrateCompanySources(bigquery: BigQuery, CompanySourceUrlM: any): Promise<number> {
  console.log('📥 Fetching Company_Sources_Urls from BigQuery...')
  const rows = await fetchRows(bigquery, 'Company_Sources_Urls')
  console.log(`  Found ${rows.length} rows`)

  if (DRY_RUN) {
    console.log('  [dry-run] Sample row:', JSON.stringify(rows[0], null, 2))
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
          source_url: row.source_url ?? undefined,
          source_origin: row.source_origin ?? undefined,
          is_custom_url: row.is_custom_url ?? undefined,
          is_verified: row.is_verified ?? undefined,
          added_by_admin: row.added_by_admin ?? undefined,
          added_date: toDate(row.added_date),
          user_notes: row.user_notes ?? undefined,
          status: row.status ?? 'active',
          created_at: toDate(row.created_at),
          updated_at: toDate(row.updated_at),
          platform_meta: parsePlatformMeta(row.platform_meta),
        },
      },
      upsert: true,
    },
  }))

  const result = await CompanySourceUrlM.bulkWrite(operations)
  console.log(`  ✅ Upserted ${result.upsertedCount} new, modified ${result.modifiedCount} existing`)
  return rows.length
}

async function migrateProfessionalSources(bigquery: BigQuery, ProfessionalSourceUrlM: any): Promise<number> {
  console.log('📥 Fetching Professional_Sources_Urls from BigQuery...')
  const rows = await fetchRows(bigquery, 'Professional_Sources_Urls')
  console.log(`  Found ${rows.length} rows`)

  if (DRY_RUN) {
    console.log('  [dry-run] Sample row:', JSON.stringify(rows[0], null, 2))
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
          source_url: row.source_url ?? undefined,
          source_origin: row.source_origin ?? undefined,
          is_custom_url: row.is_custom_url ?? undefined,
          is_verified: row.is_verified ?? undefined,
          added_by_admin: row.added_by_admin ?? undefined,
          added_date: toDate(row.added_date),
          user_notes: row.user_notes ?? undefined,
          status: row.status ?? 'active',
          is_current_position: row.is_current_position ?? undefined,
          created_at: toDate(row.created_at),
          updated_at: toDate(row.updated_at),
          platform_meta: parsePlatformMeta(row.platform_meta),
        },
      },
      upsert: true,
    },
  }))

  const result = await ProfessionalSourceUrlM.bulkWrite(operations)
  console.log(`  ✅ Upserted ${result.upsertedCount} new, modified ${result.modifiedCount} existing`)
  return rows.length
}

async function main() {
  console.log(`🚀 Sources migration starting${DRY_RUN ? ' (DRY RUN - no writes, no MongoDB connection)' : ''}...`)

  const bigquery = new BigQuery({ projectId: PROJECT_ID, keyFilename: KEY_FILE })

  // Deliberately dynamic imports: config/database.js auto-connects to the LIVE database as a
  // side effect of merely being required (see its own "Also auto-connect for backward
  // compatibility" line) - a plain top-level `import` would have opened that connection even in
  // --dry-run mode. Only load it when we're actually about to write.
  let CompanySourceUrlM: any
  let ProfessionalSourceUrlM: any
  let mongoose: typeof mongooseType | undefined

  if (!DRY_RUN) {
    mongoose = require('mongoose')
    await require('../config/database').connectDatabase()
    ;({ CompanySourceUrlM, ProfessionalSourceUrlM } = require('../src/modules/sources/sources.models'))
  }

  const companyCount = await migrateCompanySources(bigquery, CompanySourceUrlM)
  const professionalCount = await migrateProfessionalSources(bigquery, ProfessionalSourceUrlM)

  console.log(`\n✅ Done. Company sources: ${companyCount}, Professional sources: ${professionalCount}`)

  if (!DRY_RUN && mongoose) {
    await mongoose.connection.close()
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
