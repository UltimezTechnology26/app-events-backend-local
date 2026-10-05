/**
 * One-off data migration: copies every row out of the legacy `cln_company_faq_lists` collection
 * into the shared, module-discriminated `cln_app_faqs` collection (src/common/app-faq) with
 * `module: 'company'`, `company_row_id` renamed to `root_document_id`, and `faq_question`/
 * `faq_answer` renamed to `question`/`answer` - matching markets-backend-local's own cln_faqs
 * field names (models/default/faqM.ts). Also assigns `sort_order` (0, 1, 2... per company,
 * ordered by the legacy row's own `_id` ascending as a stand-in for creation order) and defaults
 * `status: 1` (active). Mirrors migrate-events-faq-to-app-faq.js exactly - see that script's own
 * comments for the full reasoning, including its CONFIRMED BUG FIX note on why `_id` is never
 * reused from the legacy collection. The legacy collection itself is left untouched/un-dropped by
 * this script - verify the new collection serves traffic correctly first, then drop
 * `cln_company_faq_lists` manually once confident.
 *
 * Idempotent in the sense that matters here: skips entirely (no-op) if this module already has any
 * rows in cln_app_faqs. Re-running after a partial failure requires clearing this module's own
 * rows first (`AppFaqM.deleteMany({ module: 'company' })`).
 *
 * Run: node scripts/migrations/migrate-company-faq-to-app-faq.js
 */
const { AppFaqM } = require('../../src/common/app-faq/app-faq.model')

const LEGACY_COLLECTION = 'cln_company_faq_lists'
const SHARED_MODULE_KEY = 'company'

function groupByCompanyRowId(rows) {
    const byCompany = new Map()
    for (const row of rows) {
        const group = byCompany.get(row.company_row_id) ?? []
        group.push(row)
        byCompany.set(row.company_row_id, group)
    }
    return byCompany
}

async function migrateCompanyFaqToAppFaq() {
    const alreadyMigrated = await AppFaqM.countDocuments({ module: SHARED_MODULE_KEY })
    if (alreadyMigrated > 0) {
        return { skipped: true, reason: `${alreadyMigrated} '${SHARED_MODULE_KEY}' rows already exist in cln_app_faqs` }
    }

    const legacyCollection = AppFaqM.db.collection(LEGACY_COLLECTION)
    const legacyRows = await legacyCollection.find({}).toArray()
    const groupedByCompany = groupByCompanyRowId(legacyRows)

    let migratedCount = 0

    for (const group of groupedByCompany.values()) {
        group.sort((a, b) => a._id - b._id)
        for (let index = 0; index < group.length; index += 1) {
            const row = group[index]
            // No `_id` set — AppFaqM's own pre('save') hook assigns a fresh one from the shared
            // counter, guaranteeing it can never collide with Events' or Professionals' rows.
            await new AppFaqM({
                module: SHARED_MODULE_KEY,
                root_document_id: row.company_row_id,
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

module.exports = { migrateCompanyFaqToAppFaq }

if (require.main === module) {
    const mongoose = require('mongoose')
    require('../../config/database')
    const waitForConnection = () =>
        mongoose.connection.readyState === 1 ? Promise.resolve() : new Promise((resolve) => mongoose.connection.once('connected', resolve))

    waitForConnection()
        .then(() => migrateCompanyFaqToAppFaq())
        .then((result) => {
            process.stdout.write(`${JSON.stringify(result)}\n`)
            process.exit(0)
        })
        .catch((err) => {
            process.stderr.write(`migrate-company-faq-to-app-faq failed: ${err.message}\n`)
            process.exit(1)
        })
}
