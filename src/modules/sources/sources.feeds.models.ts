// modules/sources/sources.feeds.models.ts
//
// Real, genuinely NEW schemas (no legacy JS model to conflict with). Ports the two BigQuery-only
// tables `Company_Feeds` and `Professional_Feeds` (project `for-ga4-bitquery-new`, dataset
// `qd_cp_app_events`) into real Mongo collections — display-only, per the user's explicit scope
// (2026-09-21): this is a one-time historical migration of the CONTENT each tracked source has
// already produced (individual tweets/RSS posts/website scrape sessions), not a new write path.
// The live fetch/scrape cron jobs that PRODUCE this data (in cp-professionals-companies-events)
// keep writing to BigQuery exactly as they do today - only the admin panel's read side moves to
// Mongo, same split already established for the Sources registry (sources.models.ts).
//
// `_id` is kept as the original BigQuery `id` string (e.g. `twitter_<post_id>_<entity_id>`,
// `rss_<entity_id>_<md5>`, `website_<company_id>_<timestamp>` - all already idempotent/deterministic
// per cp-professionals-companies-events's own `buildFeedRow`/normalize.ts), so a re-run of the
// migration script is a safe no-op upsert, same as sources.models.ts's own `_id` convention.
//
// `normalized_data`/`raw_data` are single `Object` fields (matching sources.models.ts's own
// `platform_meta` convention for variable-shape JSON) since their actual shape differs by
// `source_type` - confirmed directly against real BigQuery rows: Twitter carries
// post_id/text/posted_at/likes/reposts/replies/views/hashtags/engagement_rate/language; RSS
// carries post_id/title/summary/posted_at/author/categories/word_count/feed_type/feed_url;
// Website carries domain/pages_scraped/total_word_count/content_quality/has_blog/has_team/
// has_careers/has_contact/has_faq/has_whitepaper/links_found/page_types_found/content_hash. Only
// `normalized_data` powers the admin UI (confirmed against cp-professionals-companies-events's own
// feed-detail routes, which never read raw_data for display) - raw_data is migrated too since the
// user explicitly asked for "the full history of everything we have scraped and fetched," not
// just the display-ready subset.
import mongoose from 'mongoose'

const companyFeedSchema = new mongoose.Schema(
  {
    _id: { type: String },
    company_id: { type: Number, required: true, index: true },
    source_type: { type: String, required: true, index: true },
    source_url_id: { type: String, index: true },
    normalized_data: { type: Object },
    raw_data: { type: Object },
    fetched_at: { type: Date },
    fetch_date: { type: Date },
  },
  { versionKey: false },
)

// Powers the detail view's "every item fetched by this one source" list (source_url_id is the
// Sources registry row's own _id) and the entity-wide "all feed items for this company" case.
companyFeedSchema.index({ source_url_id: 1, fetched_at: -1 })
companyFeedSchema.index({ company_id: 1, source_type: 1, fetched_at: -1 })

export const CompanyFeedM = mongoose.model('cln_company_feeds', companyFeedSchema, 'cln_company_feeds')

const professionalFeedSchema = new mongoose.Schema(
  {
    _id: { type: String },
    professional_id: { type: Number, required: true, index: true },
    source_type: { type: String, required: true, index: true },
    source_url_id: { type: String, index: true },
    normalized_data: { type: Object },
    raw_data: { type: Object },
    fetched_at: { type: Date },
    fetch_date: { type: Date },
  },
  { versionKey: false },
)

professionalFeedSchema.index({ source_url_id: 1, fetched_at: -1 })
professionalFeedSchema.index({ professional_id: 1, source_type: 1, fetched_at: -1 })

export const ProfessionalFeedM = mongoose.model('cln_professional_feeds', professionalFeedSchema, 'cln_professional_feeds')
