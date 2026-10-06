/**
 * One-off data merge: folds the three per-module SEO collections
 *   cln_app_seo_details_event / _company / _professional   (key: root_document_id)
 * into the shared `cln_app_seo_details` collection              (key: entity_type + entity_row_id).
 *
 * Merge rules (decided from a read-only comparison of the two sides):
 *   - INSERT  a per-module row that has any SEO content and has no matching shared row.
 *   - UPDATE  a shared row only when the per-module row has content, differs, and is NEWER
 *             (updated_at, falling back to created_at). Only the SEO text/robots fields are set.
 *   - SKIP    per-module rows with no content (empty shells never overwrite real shared data),
 *             rows identical to shared, and rows where shared is newer or equal.
 *
 * The per-module collections are only read - never modified or dropped.
 *
 * Dry-run by default: prints the plan and writes NOTHING. Pass --apply to write.
 * Idempotent: once applied, a re-run finds nothing left to insert or update.
 *
 * Run:   node scripts/migrations/merge-app-seo-into-shared.js            (dry run)
 *        node scripts/migrations/merge-app-seo-into-shared.js --apply    (write)
 *        add --type=event|company|professional to limit it to one module.
 */
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const indentityCounterM = require('../../models/indentity_counterM')

const SHARED_COLLECTION = 'cln_app_seo_details'
const SOURCES = {
  event: 'cln_app_seo_details_event',
  company: 'cln_app_seo_details_company',
  professional: 'cln_app_seo_details_professional',
}

const CONTENT_FIELDS = [
  'meta_title',
  'meta_keywords',
  'meta_description',
  'robots_index',
  'robots_follow',
  'og_title',
  'og_description',
  'twitter_title',
  'twitter_description',
  'twitter_creator',
  'header_structure',
]
// Fields whose presence means "this row has real SEO content" (robots_* default to a value on
// every row, so they can't be used to tell a shell from a filled row).
const TEXT_FIELDS = CONTENT_FIELDS.filter((f) => !f.startsWith('robots_') && f !== 'header_structure')

const apply = process.argv.includes('--apply')
const typeArg = (process.argv.find((a) => a.startsWith('--type=')) || '').split('=')[1]

const norm = (v) => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : JSON.stringify(v))
const hasContent = (row) => TEXT_FIELDS.some((f) => norm(row[f]) !== '')
const changedFields = (src, dst) => CONTENT_FIELDS.filter((f) => norm(src[f]) !== norm(dst[f]))
const stamp = (row) => new Date(row.updated_at || row.created_at || 0).getTime()

function pickContent(row) {
  const picked = {}
  for (const f of CONTENT_FIELDS) if (row[f] !== undefined) picked[f] = row[f]
  return picked
}

/** Makes sure the shared collection's id counter is not behind its highest existing _id. */
async function syncCounter(shared) {
  const [top] = await shared.find({}).sort({ _id: -1 }).limit(1).project({ _id: 1 }).toArray()
  const max = top ? top._id : 0
  await indentityCounterM.updateOne({ model: SHARED_COLLECTION }, { $max: { count: max } }, { upsert: true })
  return max
}

async function nextId() {
  const res = await indentityCounterM.findOneAndUpdate(
    { model: SHARED_COLLECTION },
    { $inc: { count: 1 } },
    { upsert: true, new: true },
  )
  return res.count
}

async function main() {
  await mongoose.connect(process.env.LIVE_MAIN_DB_URL.trim(), { serverSelectionTimeoutMS: 15000 })
  const db = mongoose.connection.db
  const shared = db.collection(SHARED_COLLECTION)
  console.log(`database: ${db.databaseName}   mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`)

  const plan = { inserts: [], updates: [] }
  const skipped = { empty: 0, identical: 0, sharedNewerOrEqual: 0 }

  for (const [type, collection] of Object.entries(SOURCES)) {
    if (typeArg && typeArg !== type) continue
    const rows = await db.collection(collection).find({}).toArray()
    const ids = rows.map((r) => r.root_document_id)
    const existing = await shared.find({ entity_type: type, entity_row_id: { $in: ids } }).toArray()
    const byId = new Map(existing.map((r) => [r.entity_row_id, r]))

    for (const row of rows) {
      if (!hasContent(row)) { skipped.empty++; continue }
      const target = byId.get(row.root_document_id)
      if (!target) {
        plan.inserts.push({ type, row })
        continue
      }
      const diff = changedFields(row, target)
      if (diff.length === 0) { skipped.identical++; continue }
      if (stamp(row) > stamp(target)) plan.updates.push({ type, row, target, diff })
      else skipped.sharedNewerOrEqual++
    }
  }

  const count = (list, t) => list.filter((x) => x.type === t).length
  console.log('\nplan:')
  for (const type of Object.keys(SOURCES)) {
    if (typeArg && typeArg !== type) continue
    console.log(`  ${type.padEnd(13)} insert=${count(plan.inserts, type)}  update=${count(plan.updates, type)}`)
  }
  console.log(`  skipped: empty shells=${skipped.empty}, identical=${skipped.identical}, shared newer/equal=${skipped.sharedNewerOrEqual}`)
  console.log('\nsample inserts:')
  plan.inserts.slice(0, 5).forEach(({ type, row }) => console.log(`  ${type} #${row.root_document_id}  "${norm(row.meta_title).slice(0, 70)}"`))
  console.log('sample updates:')
  plan.updates.slice(0, 5).forEach(({ type, row, diff }) => console.log(`  ${type} #${row.root_document_id}  fields=${diff.join(',')}`))

  if (!apply) {
    console.log('\nDry run only - nothing written. Re-run with --apply to write.')
    await mongoose.disconnect()
    return
  }

  const maxId = await syncCounter(shared)
  console.log(`\ncounter synced (highest existing _id = ${maxId})`)
  let inserted = 0
  let updated = 0
  for (const { type, row } of plan.inserts) {
    await shared.insertOne({
      _id: await nextId(),
      entity_type: type,
      entity_row_id: row.root_document_id,
      ...pickContent(row),
      created_at: row.created_at || new Date(),
      updated_at: row.updated_at || row.created_at || new Date(),
    })
    inserted++
  }
  for (const { row, target } of plan.updates) {
    await shared.updateOne(
      { _id: target._id },
      { $set: { ...pickContent(row), updated_at: row.updated_at || row.created_at || new Date() } },
    )
    updated++
  }
  console.log(`applied: inserted=${inserted}, updated=${updated}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
