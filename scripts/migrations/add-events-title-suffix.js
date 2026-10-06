/**
 * One-off data update: appends " | Events Coinpedia" to the saved SEO titles (meta_title, og_title,
 * twitter_title) of every event in the shared `cln_app_seo_details` collection (entity_type 'event')
 * that doesn't already end with it, so the stored title equals what the SEO Details form shows and
 * the live event page renders.
 *
 * Only those three title fields are touched (updated_at is left as it is). Empty titles and titles
 * that already end with the suffix (any casing) are skipped, so it is safe to re-run.
 *
 * Dry-run by default: prints counts and samples, writes NOTHING. Pass --apply to write.
 *
 * Run:   node -r ts-node/register/transpile-only scripts/migrations/add-events-title-suffix.js
 *        node -r ts-node/register/transpile-only scripts/migrations/add-events-title-suffix.js --apply
 */
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const { withEventTitleSuffix } = require('../../src/modules/events-seo/events-seo.title')

const COLLECTION = 'cln_app_seo_details'
const TITLE_FIELDS = ['meta_title', 'og_title', 'twitter_title']
const BATCH_SIZE = 500
const apply = process.argv.includes('--apply')

async function main() {
  await mongoose.connect(process.env.LIVE_MAIN_DB_URL.trim(), { serverSelectionTimeoutMS: 15000 })
  const coll = mongoose.connection.db.collection(COLLECTION)
  console.log(`database: ${mongoose.connection.db.databaseName}   mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`)

  const cursor = coll.find({ entity_type: 'event' }, { projection: { entity_row_id: 1, meta_title: 1, og_title: 1, twitter_title: 1 } })
  const perField = { meta_title: 0, og_title: 0, twitter_title: 0 }
  const samples = []
  let scanned = 0
  let rowsChanged = 0
  let ops = []

  const flush = async () => {
    if (apply && ops.length) await coll.bulkWrite(ops, { ordered: false })
    ops = []
  }

  for await (const row of cursor) {
    scanned++
    const $set = {}
    for (const field of TITLE_FIELDS) {
      const next = withEventTitleSuffix(row[field])
      if (next && next !== String(row[field]).trim()) {
        $set[field] = next
        perField[field]++
      }
    }
    if (!Object.keys($set).length) continue
    rowsChanged++
    if (samples.length < 5) samples.push({ event: row.entity_row_id, from: row.meta_title, to: $set.meta_title })
    ops.push({ updateOne: { filter: { _id: row._id, entity_type: 'event' }, update: { $set } } })
    if (ops.length >= BATCH_SIZE) await flush()
  }
  await flush()

  console.log(`events scanned: ${scanned}`)
  console.log(`rows to change: ${rowsChanged}   per field: ${JSON.stringify(perField)}`)
  samples.forEach((x) => console.log(`  event #${x.event}: "${x.from}"  ->  "${x.to}"`))
  console.log(apply ? `\napplied: ${rowsChanged} rows updated` : '\nDry run only - nothing written. Re-run with --apply to write.')
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
