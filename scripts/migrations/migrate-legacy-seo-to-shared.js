/**
 * One-off data migration: copies the legacy per-module SEO collections
 *   cln_events_seo_details        (key: event_row_id)   -> entity_type 'event'
 *   cln_company_seo_details       (key: company_row_id) -> entity_type 'company'
 *   cln_professionals_seo_details (key: user_row_id)    -> entity_type 'professional'
 * into the shared `cln_app_seo_details` collection (key: entity_type + entity_row_id).
 *
 * Rules
 *   - A legacy row with no shared row yet           -> INSERT (fresh numeric _id from the shared counter).
 *   - A legacy row whose shared row already exists  -> only EMPTY fields on the shared row are filled
 *                                                      from legacy; anything already set is never changed.
 *   - Several legacy rows for one key               -> the most recent one (highest ObjectId) wins.
 *   - Legacy collections are only read, never modified or dropped.
 *   - Inserted rows carry `migration_batch: 'legacy-seo-to-shared'`, so they can be found / removed:
 *       db.cln_app_seo_details.deleteMany({ migration_batch: 'legacy-seo-to-shared' })
 *
 * Dry-run by default: prints the plan and writes NOTHING. Flags:
 *   --apply           write the inserts / fills.
 *   --type=event|company|professional   limit to one module.
 *   --dedupe-shared   (with --apply) FIRST delete duplicate shared rows for the same (entity_type,
 *                     entity_row_id), keeping the one with the most content. Without --apply it only reports.
 *   --overwrite-system-shells   also replace the SEO text on shared rows that live traffic auto-created
 *                     (created_by 'system', never edited: updated_by/updated_at empty, not migrated) with the
 *                     legacy values - those rows only hold a default title, while legacy has the real,
 *                     hand-written SEO. A legacy value is only written when it is non-empty and different; the
 *                     previous value is kept on the row under `migration_previous`. Rows anyone has edited are
 *                     never touched.
 *   --create-index    (with --apply) FIRST create the unique (entity_type, entity_row_id) index (refuses while
 *                     duplicates remain). Done before the inserts, so lookups stay indexed and a duplicate that
 *                     live traffic creates mid-run is rejected instead of doubling.
 *
 * Idempotent: re-running finds nothing left to insert or fill.
 *
 * Run: node scripts/migrations/migrate-legacy-seo-to-shared.js [--apply] [--type=...] [--dedupe-shared] [--create-index]
 */
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const indentityCounterM = require('../../models/indentity_counterM')

const SHARED = 'cln_app_seo_details'
const COUNTER_KEY = 'cln_app_seo_details'
const BATCH_TAG = 'legacy-seo-to-shared'
const BATCH_SIZE = 1000

const SOURCES = [
  { type: 'event', collection: 'cln_events_seo_details', key: 'event_row_id' },
  { type: 'company', collection: 'cln_company_seo_details', key: 'company_row_id' },
  { type: 'professional', collection: 'cln_professionals_seo_details', key: 'user_row_id' },
]
const TEXT_FIELDS = ['meta_title', 'meta_keywords', 'meta_description', 'og_title', 'og_description', 'twitter_title', 'twitter_description', 'twitter_creator']
const ENUM_FIELDS = { robots_index: 'index', robots_follow: 'follow' }

const apply = process.argv.includes('--apply')
const dedupe = process.argv.includes('--dedupe-shared')
const createIndex = process.argv.includes('--create-index')
const overwriteShells = process.argv.includes('--overwrite-system-shells')
const typeArg = (process.argv.find((a) => a.startsWith('--type=')) || '').split('=')[1]

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
const richness = (row) => TEXT_FIELDS.filter((f) => !isEmpty(row[f])).length + (Array.isArray(row.header_structure) && row.header_structure.length ? 1 : 0)

function buildInsert(source, legacy, id, now) {
  const doc = { _id: id, entity_type: source.type, entity_row_id: legacy[source.key] }
  for (const f of TEXT_FIELDS) doc[f] = legacy[f] ?? ''
  for (const [f, fallback] of Object.entries(ENUM_FIELDS)) doc[f] = legacy[f] || fallback
  doc.header_structure = Array.isArray(legacy.header_structure) ? legacy.header_structure : []
  doc.created_by = { type: 'system', id: null }
  doc.created_at = now
  doc.updated_by = null
  doc.updated_at = null
  doc.migration_batch = BATCH_TAG
  return doc
}

/** A row live traffic auto-created and nobody has edited since, and that this migration did not write. */
const isUntouchedSystemShell = (row) =>
  row.created_by?.type === 'system' && !row.updated_by && !row.updated_at && !row.migration_batch

/**
 * Fields of the shared row to change from the legacy row: always the ones that are empty on shared; with
 * --overwrite-system-shells, also the ones an untouched system row holds that differ from a non-empty legacy value.
 */
function fillsFor(shared, legacy) {
  const set = {}
  const overwrite = overwriteShells && isUntouchedSystemShell(shared)
  const previous = {}
  for (const f of TEXT_FIELDS) {
    if (isEmpty(legacy[f])) continue
    if (isEmpty(shared[f])) set[f] = legacy[f]
    else if (overwrite && String(shared[f]).trim() !== String(legacy[f]).trim()) { previous[f] = shared[f]; set[f] = legacy[f] }
  }
  if (Object.keys(previous).length) { set.migration_previous = previous; set.migration_overwritten_at = new Date() }
  const sharedHeaders = Array.isArray(shared.header_structure) ? shared.header_structure : []
  if (!sharedHeaders.length && Array.isArray(legacy.header_structure) && legacy.header_structure.length) set.header_structure = legacy.header_structure
  return set
}

async function latestLegacyByKey(db, source) {
  const latest = new Map()
  let duplicateKeys = 0
  let skippedNoKey = 0
  for await (const row of db.collection(source.collection).find({})) {
    const key = row[source.key]
    if (key === undefined || key === null) { skippedNoKey++; continue }
    const current = latest.get(key)
    if (current) duplicateKeys++
    if (!current || String(row._id) > String(current._id)) latest.set(key, row)
  }
  return { latest, duplicateKeys, skippedNoKey }
}

async function reserveIds(count) {
  const res = await indentityCounterM.findOneAndUpdate({ model: COUNTER_KEY }, { $inc: { count } }, { upsert: true, new: true })
  return res.count - count + 1 // first id of the reserved block
}

async function findSharedDuplicates(shared, type) {
  return shared
    .aggregate([
      ...(type ? [{ $match: { entity_type: type } }] : []),
      { $group: { _id: { t: '$entity_type', k: '$entity_row_id' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray()
}

async function main() {
  await mongoose.connect(process.env.LIVE_MAIN_DB_URL.trim(), { serverSelectionTimeoutMS: 20000 })
  const db = mongoose.connection.db
  const shared = db.collection(SHARED)
  console.log(`database: ${db.databaseName}   mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`)

  const totals = { insert: 0, fillRows: 0 }
  const plans = []
  for (const source of SOURCES) {
    if (typeArg && typeArg !== source.type) continue
    const { latest, duplicateKeys, skippedNoKey } = await latestLegacyByKey(db, source)
    const existing = new Map()
    for await (const row of shared.find({ entity_type: source.type })) {
      const prev = existing.get(row.entity_row_id)
      if (!prev || richness(row) > richness(prev)) existing.set(row.entity_row_id, row)
    }
    const inserts = []
    const fills = []
    for (const [key, legacy] of latest) {
      const current = existing.get(key)
      if (!current) { inserts.push(legacy); continue }
      const set = fillsFor(current, legacy)
      if (Object.keys(set).length) fills.push({ _id: current._id, set })
    }
    plans.push({ source, inserts, fills })
    totals.insert += inserts.length
    totals.fillRows += fills.length
    console.log(`[${source.type}] legacy keys=${latest.size} (duplicate legacy rows collapsed=${duplicateKeys}, rows without key=${skippedNoKey}) | already in shared=${existing.size} | to INSERT=${inserts.length} | shared rows to FILL=${fills.length}`)
  }

  const dupes = await findSharedDuplicates(shared, typeArg)
  console.log(`\nshared duplicate (entity_type, entity_row_id) groups: ${dupes.length}${dupes.length ? '  e.g. ' + JSON.stringify(dupes.slice(0, 3).map((d) => ({ ...d._id, ids: d.ids }))) : ''}`)
  console.log(`TOTAL  insert=${totals.insert}  fill=${totals.fillRows}`)

  if (!apply) {
    console.log('\nDry run only - nothing written. Re-run with --apply (add --dedupe-shared / --create-index when ready).')
    await mongoose.disconnect()
    return
  }

  // Keep the counter at or above the highest existing _id before reserving a block.
  const [top] = await shared.find({}).sort({ _id: -1 }).limit(1).project({ _id: 1 }).toArray()
  await indentityCounterM.updateOne({ model: COUNTER_KEY }, { $max: { count: top ? top._id : 0 } }, { upsert: true })

  if (dedupe) {
    const groups = await findSharedDuplicates(shared, typeArg)
    let removed = 0
    for (const g of groups) {
      const rows = await shared.find({ _id: { $in: g.ids } }).toArray()
      rows.sort((a, b) => richness(b) - richness(a) || a._id - b._id)
      const drop = rows.slice(1).map((r) => r._id)
      await shared.deleteMany({ _id: { $in: drop } })
      removed += drop.length
    }
    console.log(`deduped shared duplicates: groups=${groups.length}, rows removed=${removed}`)
  }

  if (createIndex) {
    const left = await findSharedDuplicates(shared, undefined)
    if (left.length) console.log(`NOT creating the unique index: ${left.length} duplicate groups remain (re-run with --dedupe-shared).`)
    else {
      await shared.createIndex({ entity_type: 1, entity_row_id: 1 }, { unique: true, name: 'entity_type_1_entity_row_id_1' })
      console.log('created unique index on (entity_type, entity_row_id)')
    }
  }

  const now = new Date()
  let inserted = 0
  let filled = 0
  let skippedExisting = 0
  for (const { source, inserts, fills } of plans) {
    for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
      const chunk = inserts.slice(i, i + BATCH_SIZE)
      const firstId = await reserveIds(chunk.length)
      try {
        await shared.insertMany(chunk.map((legacy, n) => buildInsert(source, legacy, firstId + n, now)), { ordered: false })
        inserted += chunk.length
      } catch (err) {
        // With the unique index in place, a key that live traffic created in the meantime is rejected
        // (E11000) - that row already exists, so it is skipped; everything else in the chunk is kept.
        if (err?.code !== 11000 && !err?.writeErrors?.every((w) => w.code === 11000)) throw err
        const ok = err.result?.insertedCount ?? err.insertedCount ?? 0
        inserted += ok
        skippedExisting += chunk.length - ok
      }
      process.stdout.write(`  ${source.type}: inserted ${Math.min(i + BATCH_SIZE, inserts.length)}/${inserts.length}\r`)
    }
    for (let i = 0; i < fills.length; i += BATCH_SIZE) {
      const chunk = fills.slice(i, i + BATCH_SIZE)
      await shared.bulkWrite(chunk.map((f) => ({ updateOne: { filter: { _id: f._id }, update: { $set: f.set } } })), { ordered: false })
      filled += chunk.length
    }
    console.log(`  ${source.type}: done                      `)
  }
  console.log(`\napplied: inserted=${inserted}, filled=${filled}, skipped (already created by live traffic)=${skippedExisting}`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
