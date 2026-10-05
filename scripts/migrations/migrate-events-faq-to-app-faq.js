/**
 * One-off data migration: copies every row out of the legacy `cln_events_faq_lists` collection
 * into the new shared, module-discriminated `cln_app_faqs` collection (src/common/app-faq) with
 * `module: 'event'`, `event_row_id` renamed to `root_document_id`, and `faq_question`/
 * `faq_answer` renamed to `question`/`answer` - matching markets-backend-local's own cln_faqs
 * field names (models/default/faqM.ts). Also assigns `sort_order` (0, 1, 2... per event, ordered
 * by the legacy row's own `_id` ascending as a stand-in for creation order - the legacy collection
 * never recorded a real timestamp) and defaults `status: 1` (active), since neither field existed
 * before this migration. The legacy collection itself is left untouched/un-dropped by this script
 * - verify the new collection serves traffic correctly first, then drop `cln_events_faq_lists`
 * manually once confident.
 *
 * Read side uses the raw native collection (not a Mongoose model) since the old model file
 * (models/app/events/event_faqM.js) was removed as part of this same migration.
 *
 * Idempotent: upserts by `_id`, so re-running only re-copies/no-ops, never duplicates. Also seeds
 * (never lowers, via $max) the `cln_app_faqs` identity counter past the highest migrated `_id`, so
 * `getCollectionID('cln_app_faqs')` can never hand out an id that collides with a migrated row -
 * required before this collection accepts any new write.
 *
 * Run: node scripts/migrations/migrate-events-faq-to-app-faq.js
 */
const { AppFaqM } = require('../../src/common/app-faq/app-faq.model')
const indentity_counterM = require('../../models/indentity_counterM')

const LEGACY_COLLECTION = 'cln_events_faq_lists'
const SHARED_COUNTER_MODEL = 'cln_app_faqs'
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
    const legacyCollection = AppFaqM.db.collection(LEGACY_COLLECTION)
    const legacyRows = await legacyCollection.find({}).toArray()
    const groupedByEvent = groupByEventRowId(legacyRows)

    let migratedCount = 0
    let maxId = 0

    for (const group of groupedByEvent.values()) {
        group.sort((a, b) => a._id - b._id)
        for (let index = 0; index < group.length; index += 1) {
            const row = group[index]
            await AppFaqM.updateOne(
                { _id: row._id },
                {
                    $set: {
                        module: SHARED_MODULE_KEY,
                        root_document_id: row.event_row_id,
                        question: row.faq_question,
                        answer: row.faq_answer,
                        sort_order: index,
                        status: 1,
                    },
                },
                { upsert: true }
            )
            migratedCount += 1
            if (row._id > maxId) {
                maxId = row._id
            }
        }
    }

    if (maxId > 0) {
        await indentity_counterM.findOneAndUpdate(
            { model: SHARED_COUNTER_MODEL },
            { $max: { count: maxId } },
            { upsert: true }
        )
    }

    return { legacyRowCount: legacyRows.length, migratedCount, counterSeededTo: maxId }
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
