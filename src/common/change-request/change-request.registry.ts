import { LabelResolver, SchemaPathLookup } from './change-request.diff'

const company_seo_detailsM = require('../../../models/app/company/company_seo_detailsM')
const company_social_linksM = require('../../../models/app/company/company_social_linksM')
const company_faqM = require('../../../models/app/company/company_faqM')
const company_holdingM = require('../../../models/markets/products_n_holding/company_holdingM')
const company_productsM = require('../../../models/markets/products_n_holding/company_productsM')
const company_revenue_growthM = require('../../../models/app/company/company_revenue_growthM')
const fundingInvestmentM = require('../../../models/app/funding/fundingInvestmentM')
const professionals_work_experienceM = require('../../../models/app/professionals_work_experienceM')
const companyM = require('../../../models/app/company/companyM')
const jobsM = require('../../../models/app/jobs/jobsM')
const companyAcquisitionsM = require('../../../models/app/company/companyAcquisitionsM')
import { JOBS_LABEL_RESOLVERS } from '../../modules/jobs/jobs.label-resolvers'
import { BASIC_DETAILS_LABEL_RESOLVERS } from '../../modules/company/settings/company.settings.label-resolvers'
import { TEAM_MEMBERS_LABEL_RESOLVERS, TEAM_MEMBERS_FIELD_LABELS, TEAM_MEMBERS_DISPLAY_FIELDS } from '../../modules/team-members/team-members.label-resolvers'
import { INVESTMENT_LABEL_RESOLVERS, FUNDING_ROUND_LABEL_RESOLVERS } from '../../modules/funding/funding.label-resolvers'
import { ACQUISITIONS_LABEL_RESOLVERS } from '../../modules/company_acquisitions/company_acquisitions.label-resolvers'
import { OWNED_PRODUCTS_LABEL_RESOLVERS } from '../../modules/company_products/company_products.label-resolvers'
import { HOLDING_CRYPTO_LABEL_RESOLVERS } from '../../modules/company_holdings/company_holdings.label-resolvers'
import { REVENUE_LABEL_RESOLVERS } from '../../modules/company_revenue/company_revenue.label-resolvers'

/**
 * Every `invalidateCache` below requires its cache module LAZILY, inside the callback, never as
 * a top-level import - same reasoning as change-request.common-resolvers.ts's `getModel`
 * pattern (and the exact regression a static import here caused: team-members.cache.ts
 * re-exports from work-experience.cache.ts, which eagerly requires professional_positionsM,
 * which eagerly requires the shared database_helper - constructing a real `mongoose.Schema` the
 * moment this registry module loads, which breaks every test that mocks mongoose without also
 * mocking that whole transitive chain). A cache module only actually needs to be loaded at the
 * one moment a publish calls it, never at import time.
 */
function invalidateSeoCaches(rootDocumentId: number): Promise<void> {
  return require('../../modules/company/settings/company.settings.cache').invalidateSeoCaches(rootDocumentId)
}
function invalidateSocialDetailsCache(): Promise<void> {
  return require('../../modules/company/settings/company.settings.cache').invalidateSocialDetailsCache()
}
function invalidateFaqCaches(): Promise<void> {
  return require('../../modules/company/faq/company.faq.cache').invalidateFaqCaches()
}
function invalidateCompanyHoldingsCaches(): Promise<void> {
  return require('../../modules/company_holdings/company_holdings.cache').invalidateCompanyHoldingsCaches()
}
function invalidateCompanyProductsCaches(): Promise<void> {
  return require('../../modules/company_products/company_products.cache').invalidateCompanyProductsCaches()
}
function invalidateCompanyRevenueCaches(): Promise<void> {
  return require('../../modules/company_revenue/company_revenue.cache').invalidateCompanyRevenueCaches()
}
function invalidateFundingCaches(): Promise<void> {
  return require('../../modules/funding/funding.cache').invalidateFundingCaches()
}
function invalidateTeamMembersCaches(): Promise<void> {
  return require('../../modules/team-members/team-members.cache').invalidateTeamMembersCaches()
}
function invalidateJobCaches(): Promise<void> {
  return require('../../modules/jobs/jobs.cache').invalidateJobCaches()
}
function invalidateCompanyAcquisitionsCaches(): Promise<void> {
  return require('../../modules/company_acquisitions/company_acquisitions.cache').invalidateCompanyAcquisitionsCaches()
}

export const SECTION_SEO = 'seo'
export const SECTION_SOCIAL_MEDIA = 'social_media'
export const SECTION_FAQ = 'faq'
export const SECTION_HOLDING_CRYPTO = 'holding_crypto'
export const SECTION_OWNED_PRODUCTS = 'owned_products'
export const SECTION_REVENUE = 'revenue'
export const SECTION_INVESTMENT = 'investment'
export const SECTION_TEAM_MEMBERS = 'team_members'
export const SECTION_BASIC_DETAILS = 'basic_details'
export const SECTION_JOBS = 'jobs'
export const SECTION_FUNDING_ROUND = 'funding_round'
export const SECTION_ACQUISITIONS = 'acquisitions'

export interface SectionConfig {
  collection: string
  /** The field linking a row to its owning company. */
  keyField: string
  isList: boolean
  /** Whitelist of admin-editable fields. Fails safe: anything absent is never diffed. */
  editableFields: readonly string[]
  /** Only foreign-key fields need an entry; everything else is stored verbatim. */
  labelResolvers: Record<string, LabelResolver>
  /**
   * Human-readable name for a field, shown to a reviewer instead of its raw schema key (e.g.
   * "Name" instead of "user_row_id"). A field without an entry falls back to its raw key -
   * existing behaviour, unaffected for every section that doesn't configure this.
   */
  fieldLabels?: Record<string, string>
  /**
   * Allowlist restricting which fields are actually surfaced to a reviewer (the STORED
   * `changes`/audit-log entries), separate from `editableFields` above. A field left out of this
   * list still rides along in the payload via `editableFields` (so publish keeps working) - it's
   * just never shown, because it's internal bookkeeping with no corresponding form field (e.g.
   * `user_account_type`, `till_date_status`) and would only confuse a non-developer reviewer.
   * Undefined = show every editableFields change (existing behaviour, unaffected unless
   * configured).
   */
  displayFields?: readonly string[]
  schemaPaths: SchemaPathLookup
  /**
   * When set, a publish of a 'delete' change request $sets this field to `true` instead of
   * actually removing the row (change-request.apply.writers.ts's applyChildWrite). Jobs is the
   * only section so far whose live delete is already a soft delete (legacy job.js's own
   * `GET /delete/:job_id` sets `is_deleted: true`, never a real Mongo delete) — every other
   * section's delete is a real row removal, so this stays undefined for them.
   */
  softDeleteField?: string
  /**
   * When true, change-request.apply.ts skips the generic applySectionWrite entirely and calls
   * a section-specific writer instead (imported directly into apply.ts, same pattern as Basic
   * Details' applyBasicDetailsSideEffects). Funding (Raised)'s "round" is N sibling rows sharing
   * one round_id, edited as a whole (create inserts a fresh set, update deletes every row for
   * that round_id and re-inserts a new set) — a shape the generic single-row applyChildWrite
   * cannot express at all, not even with a special-case branch like softDeleteField above.
   */
  customWriter?: boolean
  /**
   * CONFIRMED BUG FIX: change-request.apply.ts's applyChangeRequest never invalidated ANY
   * section's Redis cache after a publish - every section (not just this one) kept serving its
   * pre-publish cached list/detail response until that cache's TTL happened to expire on its own
   * (confirmed report: a newly published Owned Product missing from the products list, which was
   * being served `cache_response_status: true`). Called best-effort, after the live write commits
   * - same "failure here doesn't roll back the already-committed write" convention already used
   * for insertChangeLog and applyBasicDetailsSideEffects. Undefined only for Basic Details, whose
   * own applyBasicDetailsSideEffects already calls invalidateBasicDetailsCaches() itself on both
   * its create and update branches.
   */
  invalidateCache?: (rootDocumentId: number) => Promise<void>
}

const SEO_EDITABLE_FIELDS = [
  'meta_title',
  'meta_description',
  'meta_keywords',
  'robots_index',
  'robots_follow',
  'twitter_creator',
  'og_title',
  'og_description',
  'twitter_title',
  'twitter_description',
] as const

/** Every field here is a genuine, understandable form input - no displayFields filtering needed, just friendlier names than the raw schema keys. */
const SEO_FIELD_LABELS: Record<string, string> = {
  meta_title: 'Meta Title',
  meta_description: 'Meta Description',
  meta_keywords: 'Meta Keywords',
  robots_index: 'Robots Index',
  robots_follow: 'Robots Follow',
  twitter_creator: 'Twitter Creator',
  og_title: 'OG Title',
  og_description: 'OG Description',
  twitter_title: 'Twitter Title',
  twitter_description: 'Twitter Description',
}

const SOCIAL_MEDIA_EDITABLE_FIELDS = [
  'facebook',
  'twitter',
  'linkedin',
  'instagram',
  'video_link',
  'telegram',
  'youtube_channel',
  'medium',
  'reddit',
  'feed_url',
  'other_social_links',
] as const

/** Every field here is its own form input already named after the platform - labels only tidy up casing/spacing. */
const SOCIAL_MEDIA_FIELD_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  video_link: 'Video Link',
  telegram: 'Telegram',
  youtube_channel: 'YouTube Channel',
  medium: 'Medium',
  reddit: 'Reddit',
  feed_url: 'Feed URL',
  other_social_links: 'Other Social Links',
}

const FAQ_EDITABLE_FIELDS = ['faq_question', 'faq_answer'] as const

const FAQ_FIELD_LABELS: Record<string, string> = {
  faq_question: 'Question',
  faq_answer: 'Answer',
}

const HOLDING_CRYPTO_EDITABLE_FIELDS = [
  'token_type',
  'token_row_id',
  'purchased_date',
  'purchased_value',
  'purchased_value_in_usd',
  'company_type',
] as const

const HOLDING_CRYPTO_FIELD_LABELS: Record<string, string> = {
  token_row_id: 'Token',
  purchased_date: 'Purchased Date',
  purchased_value: 'Purchased Value',
  purchased_value_in_usd: 'Purchased Value (USD)',
}

/**
 * `token_type`/`company_type` are the same "registered vs manually-added" internal bookkeeping
 * flag pattern as Team Members' `user_account_type`/`company_type` - set automatically when an
 * admin searches/picks a token, never their own form control, and meaningless to a non-developer
 * reviewer on their own. `token_row_id` already resolves to the actual token's name.
 */
const HOLDING_CRYPTO_DISPLAY_FIELDS = [
  'token_row_id',
  'purchased_date',
  'purchased_value',
  'purchased_value_in_usd',
] as const

const OWNED_PRODUCTS_EDITABLE_FIELDS = [
  'company_type',
  'register_type',
  'product_type',
  'product_row_id',
] as const

const OWNED_PRODUCTS_FIELD_LABELS: Record<string, string> = {
  product_type: 'Product Type',
  product_row_id: 'Product',
}

/** `register_type`/`company_type` are the same internal registered-vs-manual bookkeeping flag as Holding Crypto's own pair above - `product_type` (Token/Chain/Exchange) and the resolved `product_row_id` are the two real form inputs. */
const OWNED_PRODUCTS_DISPLAY_FIELDS = ['product_type', 'product_row_id'] as const

const REVENUE_EDITABLE_FIELDS = [
  'year',
  'quarter',
  'revenue',
  'revenue_streams',
] as const

const REVENUE_FIELD_LABELS: Record<string, string> = {
  year: 'Year',
  quarter: 'Quarter',
  revenue: 'Revenue',
  revenue_streams: 'Revenue Streams',
}

/**
 * Includes fields that aren't really "reviewer-editable content" (investor_type,
 * investor_registered_type, funds_raised_registered_type, funds_raised_company_row_id,
 * round_id, verified_status, verified_on, date_n_time) alongside the genuinely admin-facing
 * ones (category_row_id, investor_category_row_id, announcement_date, amount) — deliberately,
 * not an oversight. Unlike every other section here, an investment row has relational/system
 * fields that must survive into the published document but aren't user-facing edits; since
 * computeDiff only ever carries SUBMITTED fields that are also in this whitelist into the
 * pending payload (change-request.diff.ts), omitting them would silently drop them on publish
 * and create a broken row with no funds-raised counterparty. The system fields used to also leak
 * into a reviewer's diff view as harmless-but-confusing noise (e.g. "investor_type: null -> 2") -
 * INVESTMENT_DISPLAY_FIELDS below now keeps them out of what's actually shown, while they still
 * ride along here for payload correctness. `investor_row_id` is deliberately NOT listed: it's
 * this section's keyField (set automatically from root_document_id), same as every other section
 * excludes its own key field.
 */
const INVESTMENT_EDITABLE_FIELDS = [
  'category_row_id',
  'investor_category_row_id',
  'announcement_date',
  'amount',
  'investor_type',
  'investor_registered_type',
  'funds_raised_registered_type',
  'funds_raised_company_row_id',
  'round_id',
  'verified_status',
  'verified_on',
  'date_n_time',
] as const

const INVESTMENT_FIELD_LABELS: Record<string, string> = {
  category_row_id: 'Investment Category',
  investor_category_row_id: 'Investor Category',
  announcement_date: 'Announcement Date',
  amount: 'Amount',
}

/** Only these four are genuinely admin-facing form fields - see the doc comment on INVESTMENT_EDITABLE_FIELDS above for why the rest still ride along in the payload without being shown. */
const INVESTMENT_DISPLAY_FIELDS = ['category_row_id', 'investor_category_row_id', 'announcement_date', 'amount'] as const

/**
 * Same reasoning as INVESTMENT_EDITABLE_FIELDS above: mixes genuinely admin-editable content
 * (employment_type, designation_type, location_type, responsibilities, start_date, positions,
 * position_row_id, position_type, sub_position_row_id, public_view) with create-only "system"
 * fields (user_row_id, user_account_type, company_type, till_date_status, verified_status,
 * verified_on) that must still ride along in the payload so a brand-new team member's pending
 * request produces a valid, functioning row on publish — omitting them would silently drop them
 * and create a row with no linked user or lifecycle state. `company_row_id` is deliberately NOT
 * listed: it's this section's keyField, set automatically from root_document_id.
 */
const TEAM_MEMBERS_EDITABLE_FIELDS = [
  'employment_type',
  'designation_type',
  'location_type',
  'responsibilities',
  'start_date',
  'positions',
  'position_row_id',
  'position_type',
  'sub_position_row_id',
  'public_view',
  'user_row_id',
  'user_account_type',
  'company_type',
  'till_date_status',
  'verified_status',
  'verified_on',
] as const

/**
 * Same "system fields ride along" reasoning as INVESTMENT_EDITABLE_FIELDS/TEAM_MEMBERS_EDITABLE_
 * FIELDS above. `approval_status` is genuine business logic (a rejected company resubmitting its
 * details resets to pending — computed at submit time, same as the original synchronous code).
 * `manual_company_row_id` isn't a real companyM field at all — it rides along only so the
 * publish-time manual-company-shift side effect (applyBasicDetailsSideEffects, company.settings.
 * service.ts) knows which manual record to shift; it's stripped back out before the actual
 * company-row $set (see that function). `updated_by`/`updated_by_row_id`/`updated_date_n_time`
 * are deliberately NOT listed: change-request.apply.ts's rootDocumentTrackerFields already
 * re-stamps every section's root company document with the PUBLISHING actor on every publish,
 * so tracking the submitting actor's copy here would just be redundant.
 */
const BASIC_DETAILS_EDITABLE_FIELDS = [
  'business_model_id',
  'main_business_model_id',
  'regularities_details',
  'company_name',
  'company_id',
  'company_email_id',
  'contact_number',
  'website_link',
  'describe_in_one_line',
  'established_in',
  'company_valuation',
  'company_size_row_id',
  'investor_category_row_id',
  'country_id',
  'country_mobile_id',
  'company_location',
  'city',
  'state',
  'longitude',
  'latitude',
  'nft_wallet_address',
  'about_company',
  'approval_status',
  // Create-only system fields (mirroring the same pattern) — user_row_id stays 0 for an
  // admin-panel-created company, sub_admin_row_id/claim_status are only set for that path.
  'user_row_id',
  'sub_admin_row_id',
  'claim_status',
  'created_date_n_time',
  'manual_company_row_id',
] as const

const BASIC_DETAILS_FIELD_LABELS: Record<string, string> = {
  business_model_id: 'Business Model',
  main_business_model_id: 'Main Business Model',
  regularities_details: 'Regulatory Details',
  company_name: 'Company Name',
  company_id: 'Company ID',
  company_email_id: 'Company Email',
  contact_number: 'Contact Number',
  website_link: 'Website Link',
  describe_in_one_line: 'Describe In One Line',
  established_in: 'Established In',
  company_valuation: 'Company Valuation',
  company_size_row_id: 'Company Size',
  investor_category_row_id: 'Investor Category',
  country_id: 'Country',
  country_mobile_id: 'Mobile Country Code',
  company_location: 'Company Location',
  city: 'City',
  state: 'State',
  longitude: 'Longitude',
  latitude: 'Latitude',
  nft_wallet_address: 'NFT Wallet Address',
  about_company: 'About Company',
}

/**
 * Every field the Basic Details form itself exposes - `approval_status` (computed at submit
 * time, never its own form control) and the create-only system fields (`user_row_id`,
 * `sub_admin_row_id`, `claim_status`, `created_date_n_time`, `manual_company_row_id` - see the
 * doc comment on BASIC_DETAILS_EDITABLE_FIELDS above) still ride along in the payload without
 * being shown to a reviewer.
 */
const BASIC_DETAILS_DISPLAY_FIELDS = [
  'business_model_id',
  'main_business_model_id',
  'regularities_details',
  'company_name',
  'company_id',
  'company_email_id',
  'contact_number',
  'website_link',
  'describe_in_one_line',
  'established_in',
  'company_valuation',
  'company_size_row_id',
  'investor_category_row_id',
  'country_id',
  'country_mobile_id',
  'company_location',
  'city',
  'state',
  'longitude',
  'latitude',
  'nft_wallet_address',
  'about_company',
] as const

/**
 * Genuinely admin-editable posting content (job_title through job_description) plus
 * `active_status` — unlike every other list section, a job posting has its OWN dedicated
 * status-toggle endpoint (`POST /job/job_status/:job_id`) separate from the main upsert, but it
 * still ends up as a plain field update on the same row, so it's routed through
 * submitChildChangeRequest the same way (see jobs.service.ts's setJobActiveStatus) rather than
 * needing a second registry entry. `company_row_id` is deliberately NOT listed: it's this
 * section's keyField, set automatically from root_document_id. `is_deleted` is deliberately NOT
 * listed either: soft-delete is handled entirely by the DELETE action + softDeleteField below,
 * never by an update payload.
 */
const JOBS_EDITABLE_FIELDS = [
  'job_title',
  'country_id',
  'experience_level',
  'job_type',
  'work_location_type',
  'location',
  'salary_from',
  'salary_to',
  'no_of_openings',
  'application_deadline',
  'highest_education',
  'key_skills',
  'job_description',
  'active_status',
] as const

/** Every field here is genuinely admin-facing (see the doc comment above) - no displayFields filtering needed, just friendlier names. */
const JOBS_FIELD_LABELS: Record<string, string> = {
  job_title: 'Job Title',
  country_id: 'Country',
  experience_level: 'Experience Level',
  job_type: 'Job Type',
  work_location_type: 'Work Location Type',
  location: 'Location',
  salary_from: 'Salary From',
  salary_to: 'Salary To',
  no_of_openings: 'Number of Openings',
  application_deadline: 'Application Deadline',
  highest_education: 'Highest Education',
  key_skills: 'Key Skills',
  job_description: 'Job Description',
  active_status: 'Active Status',
}

/**
 * Funding (Raised)'s "round" is not one row — it's N sibling `cln_funding_investment_lists`
 * rows sharing one `round_id`, edited as a whole (funding.service.ts's createOrUpdateRound:
 * create inserts a fresh set under a new round_id, update deletes every row for that round_id
 * and re-inserts a new set from the submitted investors[] array). `investors` and
 * `reserved_round_id` aren't real cln_funding_investment_lists schema fields — `investors` rides
 * along as one opaque array value (computeDiff's default/untyped branch structurally compares
 * it, same tradeoff already accepted for Team Members' `positions` array), and
 * `reserved_round_id` is a CREATE-only system field carrying the round id reserved at submit
 * time (see funding.service.ts) through to the publish-time writer (change-request.apply.ts's
 * customWriter branch, applyFundingRoundWrite) — same "reserved id, harmless gap if rejected"
 * tradeoff already accepted for Investment/Basic Details. `verified_status`/`verified_on`/
 * `reject_type`/`reject_reason`/`date_n_time` are deliberately NOT listed: the writer re-reads
 * them fresh from the live round at publish time (same "query fresh state at publish" precedent
 * as Basic Details' applyBasicDetailsSideEffects) rather than threading them through the diff.
 */
const FUNDING_ROUND_EDITABLE_FIELDS = [
  'category_row_id',
  'announcement_date',
  'amount',
  'investors',
  'reserved_round_id',
] as const

const FUNDING_ROUND_FIELD_LABELS: Record<string, string> = {
  category_row_id: 'Funding Category',
  announcement_date: 'Announcement Date',
  amount: 'Amount',
  investors: 'Investors',
}

/** `reserved_round_id` is a create-only system field (see the doc comment above) - never its own form control, so it isn't shown. */
const FUNDING_ROUND_DISPLAY_FIELDS = ['category_row_id', 'announcement_date', 'amount', 'investors'] as const

/**
 * An acquisition record has TWO company sides (acquirer/acquired), not one — the only section
 * here that does. `verified_status`/`verified_on`/`reject_type`/`reject_reason`/
 * `submitted_by_type`/`submitted_by_company_row_id`/`date_n_time` are deliberately NOT listed:
 * those belong to Acquisitions' own PRE-EXISTING, separate approval workflow (submit/verify/
 * reject, company_acquisitions.service.ts) — the publish-time writer
 * (applyAcquisitionWrite) sets them itself (same "computed at publish time" precedent as
 * Funding Round's verified_status re-read), never threaded through this diff.
 */
const ACQUISITIONS_EDITABLE_FIELDS = [
  'acquirer_registered_type',
  'acquirer_company_row_id',
  'acquired_registered_type',
  'acquired_company_row_id',
  'acquisition_date',
  'acquisition_price',
  'facilitators',
  'stake_acquired_percent',
  'acquisition_multiple',
] as const

const ACQUISITIONS_FIELD_LABELS: Record<string, string> = {
  acquirer_company_row_id: 'Acquirer Company',
  acquired_company_row_id: 'Acquired Company',
  acquisition_date: 'Acquisition Date',
  acquisition_price: 'Acquisition Price',
  facilitators: 'Facilitators',
  stake_acquired_percent: 'Stake Acquired (%)',
  acquisition_multiple: 'Acquisition Multiple',
}

/** `acquirer_registered_type`/`acquired_registered_type` are the same internal registered-vs-manual bookkeeping flag as Holding Crypto/Owned Products' own `company_type` - set automatically by which company search result was picked, never their own form control. The resolved `acquirer_company_row_id`/`acquired_company_row_id` already show the actual company name. */
const ACQUISITIONS_DISPLAY_FIELDS = [
  'acquirer_company_row_id',
  'acquired_company_row_id',
  'acquisition_date',
  'acquisition_price',
  'facilitators',
  'stake_acquired_percent',
  'acquisition_multiple',
] as const

/**
 * Section whitelist. Section names arrive from request input, so they resolve through this map —
 * never via a dynamic model lookup, per the backend CLAUDE.md.
 *
 * `editableFields` deliberately excludes computed fields (seo_details_score, profile_score) and
 * the key field: cron jobs and score recalculation write those, and including them would fill
 * the approval queue with changes nobody made (design §7.1).
 */
export const COMPANY_SECTION_REGISTRY = {
  [SECTION_SEO]: {
    collection: 'cln_company_seo_details',
    keyField: 'company_row_id',
    isList: false,
    editableFields: SEO_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: SEO_FIELD_LABELS,
    schemaPaths: (field: string) => company_seo_detailsM.schema.path(field),
    invalidateCache: (rootDocumentId: number) => invalidateSeoCaches(rootDocumentId),
  },
  [SECTION_SOCIAL_MEDIA]: {
    collection: 'cln_company_social_links',
    keyField: 'company_row_id',
    isList: false,
    editableFields: SOCIAL_MEDIA_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: SOCIAL_MEDIA_FIELD_LABELS,
    schemaPaths: (field: string) => company_social_linksM.schema.path(field),
    invalidateCache: () => invalidateSocialDetailsCache(),
  },
  [SECTION_FAQ]: {
    collection: 'cln_company_faq_lists',
    keyField: 'company_row_id',
    isList: true,
    editableFields: FAQ_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: FAQ_FIELD_LABELS,
    schemaPaths: (field: string) => company_faqM.schema.path(field),
    invalidateCache: () => invalidateFaqCaches(),
  },
  [SECTION_HOLDING_CRYPTO]: {
    collection: 'cln_company_holdings',
    keyField: 'company_row_id',
    isList: true,
    editableFields: HOLDING_CRYPTO_EDITABLE_FIELDS,
    labelResolvers: HOLDING_CRYPTO_LABEL_RESOLVERS,
    fieldLabels: HOLDING_CRYPTO_FIELD_LABELS,
    displayFields: HOLDING_CRYPTO_DISPLAY_FIELDS,
    schemaPaths: (field: string) => company_holdingM.schema.path(field),
    invalidateCache: () => invalidateCompanyHoldingsCaches(),
  },
  [SECTION_OWNED_PRODUCTS]: {
    collection: 'cln_company_products',
    keyField: 'company_row_id',
    isList: true,
    editableFields: OWNED_PRODUCTS_EDITABLE_FIELDS,
    labelResolvers: OWNED_PRODUCTS_LABEL_RESOLVERS,
    fieldLabels: OWNED_PRODUCTS_FIELD_LABELS,
    displayFields: OWNED_PRODUCTS_DISPLAY_FIELDS,
    schemaPaths: (field: string) => company_productsM.schema.path(field),
    invalidateCache: () => invalidateCompanyProductsCaches(),
  },
  [SECTION_REVENUE]: {
    collection: 'cln_company_revenue_details',
    keyField: 'company_row_id',
    isList: true,
    editableFields: REVENUE_EDITABLE_FIELDS,
    labelResolvers: REVENUE_LABEL_RESOLVERS,
    fieldLabels: REVENUE_FIELD_LABELS,
    schemaPaths: (field: string) => company_revenue_growthM.schema.path(field),
    invalidateCache: () => invalidateCompanyRevenueCaches(),
  },
  [SECTION_INVESTMENT]: {
    collection: 'cln_funding_investment_lists',
    // The investing party's own row id (a company row id here — the admin panel's Investments
    // tab only ever edits investor_type === 2 records; investor_type === 1, a person investing,
    // has no company to scope a change request to and stays out of this system entirely).
    keyField: 'investor_row_id',
    isList: true,
    editableFields: INVESTMENT_EDITABLE_FIELDS,
    labelResolvers: INVESTMENT_LABEL_RESOLVERS,
    fieldLabels: INVESTMENT_FIELD_LABELS,
    displayFields: INVESTMENT_DISPLAY_FIELDS,
    schemaPaths: (field: string) => fundingInvestmentM.schema.path(field),
    invalidateCache: () => invalidateFundingCaches(),
  },
  [SECTION_TEAM_MEMBERS]: {
    collection: 'cln_professionals_work_experiences',
    keyField: 'company_row_id',
    isList: true,
    editableFields: TEAM_MEMBERS_EDITABLE_FIELDS,
    labelResolvers: TEAM_MEMBERS_LABEL_RESOLVERS,
    fieldLabels: TEAM_MEMBERS_FIELD_LABELS,
    displayFields: TEAM_MEMBERS_DISPLAY_FIELDS,
    schemaPaths: (field: string) => professionals_work_experienceM.schema.path(field),
    invalidateCache: () => invalidateTeamMembersCaches(),
  },
  [SECTION_BASIC_DETAILS]: {
    collection: 'cln_company_lists',
    // The company document IS the root document here (unlike every other section, which is a
    // child/sibling collection pointing back to the company via company_row_id) — keyField '_id'
    // makes applyDocumentWrite's generic `updateOne({_id: rootDocumentId}, {$set: payload},
    // {upsert:true})` both update an existing company AND create a brand-new one (using a
    // company_row_id reserved at submit time — see saveOrUpdateBasicCompanyDetails), with zero
    // special-case writer needed for the row write itself. Only the EXTRA side effects (SEO/
    // social seeding, its audit log, sub-admin notification, manual-company shift, profile
    // score) need custom publish-time logic — see change-request.apply.ts's post-transaction
    // call to applyBasicDetailsSideEffects.
    keyField: '_id',
    isList: false,
    editableFields: BASIC_DETAILS_EDITABLE_FIELDS,
    labelResolvers: BASIC_DETAILS_LABEL_RESOLVERS,
    fieldLabels: BASIC_DETAILS_FIELD_LABELS,
    displayFields: BASIC_DETAILS_DISPLAY_FIELDS,
    schemaPaths: (field: string) => companyM.schema.path(field),
  },
  [SECTION_JOBS]: {
    collection: 'cln_jobs',
    keyField: 'company_row_id',
    isList: true,
    editableFields: JOBS_EDITABLE_FIELDS,
    labelResolvers: JOBS_LABEL_RESOLVERS,
    fieldLabels: JOBS_FIELD_LABELS,
    schemaPaths: (field: string) => jobsM.schema.path(field),
    softDeleteField: 'is_deleted',
    invalidateCache: () => invalidateJobCaches(),
  },
  [SECTION_FUNDING_ROUND]: {
    collection: 'cln_funding_investment_lists',
    // Not a real per-row key field (this section never reaches the generic applyChildWrite that
    // keyField normally serves) — round_id is what this section calls "the id of the thing being
    // edited" (targetRowId), consistent with how every other list section's keyField/targetRowId
    // pair works, even though a round is N rows rather than one.
    keyField: 'round_id',
    isList: true,
    editableFields: FUNDING_ROUND_EDITABLE_FIELDS,
    labelResolvers: FUNDING_ROUND_LABEL_RESOLVERS,
    fieldLabels: FUNDING_ROUND_FIELD_LABELS,
    displayFields: FUNDING_ROUND_DISPLAY_FIELDS,
    schemaPaths: (field: string) => fundingInvestmentM.schema.path(field),
    customWriter: true,
    // Same cache as Investment above: both sections read/write cln_funding_investment_lists and
    // invalidateFundingCaches' patterns (funds_raised_list_*, company_investment_funding_*, etc.)
    // already cover both sections' list views - there's no narrower "funding round only" cache.
    invalidateCache: () => invalidateFundingCaches(),
  },
  [SECTION_ACQUISITIONS]: {
    collection: 'cln_company_acquisitions',
    // Fictional, like Funding Round's round_id above — an acquisition row has no single
    // "owning company" field at all (acquirer_company_row_id and acquired_company_row_id are
    // two independent fields), so nothing here actually reads this key; the customWriter
    // (applyAcquisitionWrite) uses the submitted acquirer/acquired fields directly instead.
    // root_document_id is "whichever company's admin screen the edit was made from" (a design
    // decision, not derived from this field), threaded through as editingCompanyRowId at submit
    // time (company_acquisitions.controller.ts/.service.ts).
    keyField: 'acquirer_company_row_id',
    isList: true,
    editableFields: ACQUISITIONS_EDITABLE_FIELDS,
    labelResolvers: ACQUISITIONS_LABEL_RESOLVERS,
    fieldLabels: ACQUISITIONS_FIELD_LABELS,
    displayFields: ACQUISITIONS_DISPLAY_FIELDS,
    schemaPaths: (field: string) => companyAcquisitionsM.schema.path(field),
    customWriter: true,
    invalidateCache: () => invalidateCompanyAcquisitionsCaches(),
  },
} as const satisfies Record<string, SectionConfig>

export type CompanySection = keyof typeof COMPANY_SECTION_REGISTRY

export const isCompanySection = (value: string): value is CompanySection =>
  Object.prototype.hasOwnProperty.call(COMPANY_SECTION_REGISTRY, value)
