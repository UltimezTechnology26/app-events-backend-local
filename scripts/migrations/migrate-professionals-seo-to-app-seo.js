/**
 * One-off data migration: copies every row out of the legacy `cln_professionals_seo_details`
 * collection into the new, professionals-only `cln_app_seo_details_professional` collection
 * (src/common/app-seo/app-seo.model.ts), with `user_row_id` renamed to `root_document_id` and a
 * fresh `_id` assigned from this new collection's own counter (never reused from the legacy
 * collection - same data-safety rule the FAQ migrations established).
 *
 * The legacy collection itself is left untouched/un-dropped by this script - verify the new
 * collection serves traffic correctly first, then drop `cln_professionals_seo_details` manually
 * once confident.
 *
 * Idempotent: skips entirely (no-op) if the new collection already has any rows at all.
 * Re-running after a partial failure requires clearing it first
 * (`ProfessionalSeoDetailsM.deleteMany({})`).
 *
 * Run: node -r ts-node/register/transpile-only scripts/migrations/migrate-professionals-seo-to-app-seo.js
 */
const { ProfessionalSeoDetailsM } = require('../../src/modules/professionals-seo/professionals-seo.models')

const LEGACY_COLLECTION = 'cln_professionals_seo_details'

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

async function migrateProfessionalsSeoToAppSeo() {
    const alreadyMigrated = await ProfessionalSeoDetailsM.countDocuments({})
    if (alreadyMigrated > 0) {
        return { skipped: true, reason: `${alreadyMigrated} rows already exist in cln_app_seo_details_professional` }
    }

    const legacyCollection = ProfessionalSeoDetailsM.db.collection(LEGACY_COLLECTION)
    const legacyRows = await legacyCollection.find({}).toArray()

    let migratedCount = 0
    for (const row of legacyRows) {
        if (!row.user_row_id) continue
        await new ProfessionalSeoDetailsM({
            root_document_id: row.user_row_id,
            ...pickFields(row),
            created_by: { type: 'system', id: null },
            created_at: new Date(),
        }).save()
        migratedCount += 1
    }

    return { legacyRowCount: legacyRows.length, migratedCount }
}

module.exports = { migrateProfessionalsSeoToAppSeo }

if (require.main === module) {
    const mongoose = require('mongoose')
    require('../../config/database')
    const waitForConnection = () =>
        mongoose.connection.readyState === 1 ? Promise.resolve() : new Promise((resolve) => mongoose.connection.once('connected', resolve))

    waitForConnection()
        .then(() => migrateProfessionalsSeoToAppSeo())
        .then((result) => {
            process.stdout.write(`${JSON.stringify(result)}\n`)
            process.exit(0)
        })
        .catch((err) => {
            process.stderr.write(`migrate-professionals-seo-to-app-seo failed: ${err.message}\n`)
            process.exit(1)
        })
}
