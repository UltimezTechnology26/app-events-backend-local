/**
 * One-off data migration: copies every row out of the legacy `cln_events_faq_lists` collection
 * into the shared, module-discriminated `cln_app_faqs` collection (src/common/app-faq) with
 * `module: 'event'`, `event_row_id` renamed to `root_document_id`, and `faq_question`/
 * `faq_answer` renamed to `question`/`answer` - matching markets-backend-local's own cln_faqs
 * field names (models/default/faqM.ts). Also assigns `sort_order` (0, 1, 2... per event, ordered
 * by the legacy row's own `_id` ascending as a stand-in for creation order - the legacy collection
 * never recorded a real timestamp) and defaults `status: 1` (active), since neither field existed
 * before this migration. The legacy collection itself is left untouched/un-dropped by this script
 * - verify the new collection serves traffic correctly first, then drop `cln_events_faq_lists`
 * manually once confident.
 *
 * CONFIRMED BUG FIX (2026-10-05): this script used to reuse each legacy row's own `_id` as the new
 * document's `_id` (via an upsert keyed on it). That's wrong for a collection shared across
 * domains: `cln_events_faq_lists`, `cln_company_faq_lists`, and `cln_professionals_faq_lists` each
 * had their OWN independent identity counter, so their `_id` ranges overlap - migrating Company
 * (or Professionals) after Events silently overwrote any Events row whose `_id` happened to
 * collide with one of theirs (confirmed live: Events dropped from 6199 to 869 rows after the other
 * two migrations ran). Every row now gets a genuinely fresh `_id` from the shared cln_app_faqs
 * counter (via AppFaqM's own pre('save') hook - no `_id` is set here at all), so three
 * independently-numbered legacy collections can never collide once merged into one.
 *
 * Read side uses the raw native collection (not a Mongoose model) since the old model file
 * (models/app/events/event_faqM.js) was removed as part of this same migration.
 *
 * Idempotent in the sense that matters here: skips entirely (no-op) if this module already has any
 * rows in cln_app_faqs, rather than trying to re-match rows by their old legacy `_id` (which no
 * longer means anything once a fresh id is assigned). Re-running after a partial failure requires
 * clearing this module's own rows first (`AppFaqM.deleteMany({ module: 'event' })`).
 *
 * Run: node scripts/migrations/migrate-events-faq-to-app-faq.js
 */
const { AppFaqM } = require('../../src/common/app-faq/app-faq.model')

const LEGACY_COLLECTION = 'cln_events_faq_lists'
const SHARED_MODULE_KEY = 'event'

function groupByEventRowId(rows) {
    const byEvent = new Map()
    for (const row of rows) {
        const group = byEvent.get(row.event_row_id) ?? []
        group.push(row)
        byEvent.set(row.event_row_id, group)
    }
    return byEvent
}

async function migrateEventsFaqToAppFaq() {
    const alreadyMigrated = await AppFaqM.countDocuments({ module: SHARED_MODULE_KEY })
    if (alreadyMigrated > 0) {
        return { skipped: true, reason: `${alreadyMigrated} '${SHARED_MODULE_KEY}' rows already exist in cln_app_faqs` }
    }

    const legacyCollection = AppFaqM.db.collection(LEGACY_COLLECTION)
    const legacyRows = await legacyCollection.find({}).toArray()
    const groupedByEvent = groupByEventRowId(legacyRows)

    let migratedCount = 0

    for (const group of groupedByEvent.values()) {
        group.sort((a, b) => a._id - b._id)
        for (let index = 0; index < group.length; index += 1) {
            const row = group[index]
            // No `_id` set — AppFaqM's own pre('save') hook assigns a fresh one from the shared
            // counter, guaranteeing it can never collide with Company's or Professionals' rows.
            await new AppFaqM({
                module: SHARED_MODULE_KEY,
                root_document_id: row.event_row_id,
                question: row.faq_question,
                answer: row.faq_answer,
                sort_order: index,
                status: 1,
            }).save()
            migratedCount += 1
        }
    }

    return { legacyRowCount: legacyRows.length, migratedCount }
}

module.exports = { migrateEventsFaqToAppFaq }

if (require.main === module) {
    const mongoose = require('mongoose')
    // config/database.js auto-invokes its own connectDatabase() at require-time (not awaited,
    // "for backward compatibility") - awaiting a SECOND explicit call to it races against that
    // first one and can leave the connection in a state where bufferCommands: false still rejects
    // the very first query right after "connected" logs. Waiting on mongoose's own readyState/
    // 'connected' event instead is robust regardless of how many times connect() was invoked.
    require('../../config/database')
    const waitForConnection = () =>
        mongoose.connection.readyState === 1 ? Promise.resolve() : new Promise((resolve) => mongoose.connection.once('connected', resolve))

    waitForConnection()
        .then(() => migrateEventsFaqToAppFaq())
        .then((result) => {
            process.stdout.write(`${JSON.stringify(result)}\n`)
            process.exit(0)
        })
        .catch((err) => {
            process.stderr.write(`migrate-events-faq-to-app-faq failed: ${err.message}\n`)
            process.exit(1)
        })
}
