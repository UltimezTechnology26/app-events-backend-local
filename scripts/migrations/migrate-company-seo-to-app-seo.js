/**
 * One-off data migration: copies every row out of the legacy `cln_company_seo_details` collection
 * into the new, company-only `cln_app_seo_details_company` collection
 * (src/common/app-seo/app-seo.model.ts), with `company_row_id` renamed to `root_document_id` and
 * a fresh `_id` assigned from this new collection's own counter (never reused from the legacy
 * collection - same data-safety rule the FAQ migrations established, see
 * migrate-company-faq-to-app-faq.js's own comment for why that matters). Dead duplicate fields
 * already dropped from the schema (about_company/facebook/twitter/etc, see
 * drop-dead-seo-fields.js) are simply not copied over.
 *
 * The legacy collection itself is left untouched/un-dropped by this script - verify the new
 * collection serves traffic correctly first, then drop `cln_company_seo_details` manually once
 * confident.
 *
 * Idempotent: skips entirely (no-op) if the new collection already has any rows at all.
 * Re-running after a partial failure requires clearing it first
 * (`CompanySeoDetailsM.deleteMany({})`).
 *
 * Run: node scripts/migrations/migrate-company-seo-to-app-seo.js
 */
const { CompanySeoDetailsM } = require('../../src/modules/company/settings/company.settings.models')

const LEGACY_COLLECTION = 'cln_company_seo_details'

const COPIED_FIELDS = [
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

function pickFields(row) {
    const picked = {}
    for (const field of COPIED_FIELDS) {
        if (row[field] !== undefined) picked[field] = row[field]
    }
    return picked
}

async function migrateCompanySeoToAppSeo() {
    const alreadyMigrated = await CompanySeoDetailsM.countDocuments({})
    if (alreadyMigrated > 0) {
        return { skipped: true, reason: `${alreadyMigrated} rows already exist in cln_app_seo_details_company` }
    }

    const legacyCollection = CompanySeoDetailsM.db.collection(LEGACY_COLLECTION)
    const legacyRows = await legacyCollection.find({}).toArray()

    let migratedCount = 0
    for (const row of legacyRows) {
        if (!row.company_row_id) continue
        // No `_id` set — CompanySeoDetailsM's own pre('save') hook assigns a fresh one from this
        // collection's own counter.
        await new CompanySeoDetailsM({
            root_document_id: row.company_row_id,
            ...pickFields(row),
            created_by: { type: 'system', id: null },
            created_at: new Date(),
        }).save()
        migratedCount += 1
    }

    return { legacyRowCount: legacyRows.length, migratedCount }
}

module.exports = { migrateCompanySeoToAppSeo }

if (require.main === module) {
    const mongoose = require('mongoose')
    require('../../config/database')
    const waitForConnection = () =>
        mongoose.connection.readyState === 1 ? Promise.resolve() : new Promise((resolve) => mongoose.connection.once('connected', resolve))

    waitForConnection()
        .then(() => migrateCompanySeoToAppSeo())
        .then((result) => {
            process.stdout.write(`${JSON.stringify(result)}\n`)
            process.exit(0)
        })
        .catch((err) => {
            process.stderr.write(`migrate-company-seo-to-app-seo failed: ${err.message}\n`)
            process.exit(1)
        })
}
