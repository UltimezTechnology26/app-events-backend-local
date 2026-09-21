/**
 * One-off cleanup: removes the 12 dead duplicate fields from existing cln_company_seo_details
 * documents (about_company, facebook, twitter, linkedin, instagram, video_link, telegram,
 * feed_url, medium, reddit, other_social_links, youtube_channel).
 *
 * These fields were dropped from the schema in models/app/company/company_seo_detailsM.js —
 * confirmed dead by exhaustive grep of every write site in the repo (none ever sets them) and
 * every read pipeline (buildGetCompanySeoPipeline sources social links from the separate
 * cln_company_social_links join and about_company from the root company document). Removing a
 * field from a Mongoose schema does not delete it from documents that already have it stored —
 * this script does that half, via $unset.
 *
 * Idempotent: $unset on a field that is already absent is a no-op, so re-running is safe.
 *
 * Run: node scripts/migrations/drop-dead-seo-fields.js
 */
const company_seo_detailsM = require('../../models/app/company/company_seo_detailsM')

const DEAD_FIELDS = [
    'about_company',
    'facebook',
    'twitter',
    'linkedin',
    'instagram',
    'video_link',
    'telegram',
    'feed_url',
    'medium',
    'reddit',
    'other_social_links',
    'youtube_channel'
]

const UNSET_SPEC = DEAD_FIELDS.reduce((acc, field) => {
    acc[field] = ''
    return acc
}, {})

async function dropDeadSeoFields() {
    const result = await company_seo_detailsM.updateMany(
        { $or: DEAD_FIELDS.map((field) => ({ [field]: { $exists: true } })) },
        { $unset: UNSET_SPEC }
    )
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
}

module.exports = { dropDeadSeoFields, DEAD_FIELDS }

if (require.main === module) {
    require('../../config/database')
    dropDeadSeoFields()
        .then((result) => {
            process.stdout.write(`${JSON.stringify(result)}\n`)
            process.exit(0)
        })
        .catch((err) => {
            process.stderr.write(`drop-dead-seo-fields failed: ${err.message}\n`)
            process.exit(1)
        })
}
