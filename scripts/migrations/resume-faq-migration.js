/**
 * Resume script for an interrupted FAQ migration (events / company).
 *
 * migrate-{events,company}-faq-to-app-faq.js refuse to run once a module has ANY row in `cln_app_faqs`, so a
 * run that was cut off part-way cannot simply be repeated. This script finishes the job instead: it compares
 * the legacy collection with what is already in `cln_app_faqs` for the module, and inserts ONLY the legacy
 * rows that are not there yet.
 *
 *   - A legacy row counts as "already migrated" when `cln_app_faqs` holds a row of the same module with the
 *     same root_document_id, question and answer (matched one-for-one, so genuine duplicate FAQs are kept).
 *   - Missing rows get a fresh numeric _id from the shared counter (never a legacy _id) and the sort_order they
 *     would have had: their position among that record's legacy rows, ordered by legacy _id.
 *   - Existing rows - including FAQs created through the new app since the migration began - are never touched.
 *   - Legacy collections are only read.
 *
 * Dry-run by default: prints how many rows are missing and writes NOTHING. Pass --apply to insert.
 *
 * Run: node -r ts-node/register/transpile-only scripts/migrations/resume-faq-migration.js --module=event|company [--apply]
 */
require('dotenv').config({ quiet: true })
const mongoose = require('mongoose')
const { AppFaqM } = require('../../src/common/app-faq/app-faq.model')
const indentityCounterM = require('../../models/indentity_counterM')

const COUNTER_KEY = 'cln_app_faqs'
const BATCH_SIZE = 500
const SOURCES = {
  event: { collection: 'cln_events_faq_lists', key: 'event_row_id' },
  company: { collection: 'cln_company_faq_lists', key: 'company_row_id' },
  professional: { collection: 'cln_professionals_faq_lists', key: 'user_row_id' },
}

const apply = process.argv.includes('--apply')
const moduleKey = (process.argv.find((a) => a.startsWith('--module=')) || '').split('=')[1]

const fingerprint = (root, question, answer) => `${root}\u0000${question ?? ''}\u0000${answer ?? ''}`

async function reserveIds(count) {
  const res = await indentityCounterM.findOneAndUpdate({ model: COUNTER_KEY }, { $inc: { count } }, { upsert: true, new: true })
  return res.count - count + 1
}

async function main() {
  const source = SOURCES[moduleKey]
  if (!source) {
    console.error('Pass --module=event|company|professional')
    process.exit(1)
  }
  await mongoose.connect(process.env.LIVE_MAIN_DB_URL.trim(), { serverSelectionTimeoutMS: 20000 })
  const db = mongoose.connection.db
  console.log(`database: ${db.databaseName}   module: ${moduleKey}   mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`)

  const legacyRows = await db.collection(source.collection).find({}).sort({ _id: 1 }).toArray()

  // Multiset of what is already migrated.
  const present = new Map()
  for await (const row of db.collection('cln_app_faqs').find({ module: moduleKey })) {
    const fp = fingerprint(row.root_document_id, row.question, row.answer)
    present.set(fp, (present.get(fp) || 0) + 1)
  }

  const perRecord = new Map()
  const missing = []
  for (const row of legacyRows) {
    const root = row[source.key]
    const index = perRecord.get(root) ?? 0
    perRecord.set(root, index + 1)
    const fp = fingerprint(root, row.faq_question, row.faq_answer)
    const left = present.get(fp) || 0
    if (left > 0) present.set(fp, left - 1)
    else missing.push({ root, question: row.faq_question, answer: row.faq_answer, sort_order: index })
  }

  const alreadyIn = await AppFaqM.countDocuments({ module: moduleKey })
  console.log(`legacy rows=${legacyRows.length} | rows now in cln_app_faqs for this module=${alreadyIn} | MISSING=${missing.length}`)
  missing.slice(0, 3).forEach((m) => console.log(`  e.g. record ${m.root} (position ${m.sort_order}): "${String(m.question).slice(0, 60)}"`))

  if (!apply) {
    console.log('\nDry run only - nothing written. Re-run with --apply to insert the missing rows.')
    await mongoose.disconnect()
    return
  }

  let inserted = 0
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE)
    const firstId = await reserveIds(chunk.length)
    await AppFaqM.insertMany(
      chunk.map((m, n) => ({
        _id: firstId + n,
        module: moduleKey,
        root_document_id: m.root,
        question: m.question,
        answer: m.answer,
        sort_order: m.sort_order,
        status: 1,
      })),
    )
    inserted += chunk.length
    process.stdout.write(`  inserted ${inserted}/${missing.length}\r`)
  }
  console.log(`\napplied: inserted=${inserted}; module now has ${await AppFaqM.countDocuments({ module: moduleKey })} rows`)
  await mongoose.disconnect()
}

// The shared DB config keeps timers running, so exit explicitly once finished.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAILED:', err.message)
    process.exit(1)
  })
