import { LabelResolver, SchemaPathLookup } from './change-request.diff'
import { buildArrayLabelResolver } from './change-request.common-resolvers'

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
const professionalsM = require('../../../models/app/professionalsM')
const professionals_seo_detailsM = require('../../../models/app/professionals_seo_detailsM')
const professionals_social_linksM = require('../../../models/app/professionals_social_linksM')
const professionals_awardsM = require('../../../models/app/users/professionals_awardsM')
const professionals_faqM = require('../../../models/app/users/professionals_faqM')
const eventM = require('../../../models/app/events/eventM')
const event_seo_detailsM = require('../../../models/app/events/event_seo_detailsM')
const event_link_display_detailsM = require('../../../models/app/events/event_link_display_detailsM')
const ticketM = require('../../../models/app/events/ticketM')
const couponM = require('../../../models/app/events/couponM')
const event_faq_listsM = require('../../../models/app/events/event_faqM')
const event_contactsM = require('../../../models/app/events/event_contactsM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const event_attendeesM = require('../../../models/app/events/event_attendeesM')
import { JOBS_LABEL_RESOLVERS } from '../../modules/jobs/jobs.label-resolvers'
import { BASIC_DETAILS_LABEL_RESOLVERS } from '../../modules/company/settings/company.settings.label-resolvers'
import { TEAM_MEMBERS_LABEL_RESOLVERS, TEAM_MEMBERS_FIELD_LABELS, TEAM_MEMBERS_DISPLAY_FIELDS } from '../../modules/team-members/team-members.label-resolvers'
import { INVESTMENT_LABEL_RESOLVERS, FUNDING_ROUND_LABEL_RESOLVERS } from '../../modules/funding/funding.label-resolvers'
import { ACQUISITIONS_LABEL_RESOLVERS } from '../../modules/company_acquisitions/company_acquisitions.label-resolvers'
import { OWNED_PRODUCTS_LABEL_RESOLVERS } from '../../modules/company_products/company_products.label-resolvers'
import { HOLDING_CRYPTO_LABEL_RESOLVERS } from '../../modules/company_holdings/company_holdings.label-resolvers'
import { REVENUE_LABEL_RESOLVERS } from '../../modules/company_revenue/company_revenue.label-resolvers'
import { PROFESSIONAL_DETAILS_LABEL_RESOLVERS, PROFESSIONAL_DETAILS_FIELD_LABELS, PROFESSIONAL_DETAILS_DISPLAY_FIELDS } from '../../modules/work-experience/professional-details.label-resolvers'
import {
  EVENT_BASIC_DETAILS_LABEL_RESOLVERS,
  EVENT_TICKET_LABEL_RESOLVERS,
  EVENT_CONTACT_LABEL_RESOLVERS,
  EVENT_SPEAKER_LABEL_RESOLVERS,
  EVENT_SPONSOR_PARTNER_LABEL_RESOLVERS,
  EVENT_ATTENDEE_LABEL_RESOLVERS,
} from '../../modules/events/events.label-resolvers'

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
// professional_details shares cln_professionals_work_experiences with Team Members (see this
// section's own doc comment below), but needs BOTH cache sets: the editor's own list
// (work-experience.cache.ts's individual_professional_details_*/professional_detail_list_*,
// which Team Members' own invalidateTeamMembersCaches doesn't cover) and the public profile
// page's cache (team-members.cache.ts's own app_user_other_details_*, which work-experience's
// own invalidateWorkExperienceCaches doesn't cover) - same "publish left a data source stale"
// bug class already fixed for Basic Details/Awards/FAQ's above.
async function invalidateProfessionalDetailsCaches(): Promise<void> {
  await Promise.all([
    require('../../modules/work-experience/work-experience.cache').invalidateWorkExperienceCaches(),
    invalidateTeamMembersCaches(),
  ])
}
function invalidateJobCaches(): Promise<void> {
  return require('../../modules/jobs/jobs.cache').invalidateJobCaches()
}
function invalidateCompanyAcquisitionsCaches(): Promise<void> {
  return require('../../modules/company_acquisitions/company_acquisitions.cache').invalidateCompanyAcquisitionsCaches()
}
// CONFIRMED BUG FIX: professionals.cache.ts's own invalidateProfessionalsCaches() only busts the
// admin list/overview caches (professionals_list_*, professionals_overview, etc.) - it never
// covered the public profile page's own caches (user_detail*/app_user_detail_*/
// app_popular_professionals*), which updateUserDetails's direct-write path busts separately (see
// professionals.self-service.service.ts's own Promise.all calls). Without this, publishing a
// Basic Details change request correctly refreshed the admin's All Professionals list but left
// the public profile page (and this migration's own admin View page, which reuses the same
// public-page data source) serving stale data - same bug class already found and fixed for
// Awards/FAQ's above.
async function invalidateProfessionalsCaches(): Promise<void> {
  const { deleteKeysByPattern } = require('@ultimez-interview/coinpedia-backend-library/cache')
  await Promise.all([
    require('../../modules/professionals/professionals.cache').invalidateProfessionalsCaches(),
    deleteKeysByPattern('user_detail*'),
    deleteKeysByPattern('app_user_detail_*'),
    deleteKeysByPattern('app_popular_professionals*'),
  ])
}
function invalidateProfessionalsSeoCaches(): Promise<void> {
  return require('../../modules/professionals-seo/professionals-seo.cache').invalidateAfterSeoUpdate()
}
function invalidateProfessionalsSocialLinksCaches(): Promise<void> {
  return require('../../modules/professionals-social-links/professionals-social-links.cache').invalidateAfterAuthenticatedUpdate()
}
// Awards/FAQ have no dedicated `.cache.ts` module (they cache their list responses inline via
// config/cache_helper's getCache/setCache, keyed 'users_awards_list_*'/'user_faq_list_*') - same
// CONFIRMED BUG FIX class as every other section's own invalidateCache: without this, a published
// award/FAQ change kept serving the pre-publish cached list until its 1800s TTL happened to
// expire on its own. `app_user_other_details_*` is invalidated too, matching the direct-write
// path's own Promise.all in professionals-awards.service.ts/professionals-faq.service.ts - that
// key backs the public professional profile page's `link_page/user_other_details` aggregate
// (confirmed live: without it, a just-published award/FAQ showed correctly in the admin editor's
// own list, which reads the first cache key, but the public profile page kept showing stale data
// from the second, unbusted one).
async function invalidateProfessionalsAwardsCaches(): Promise<void> {
  const { deleteKeysByPattern } = require('../../../config/cache_helper')
  await Promise.all([deleteKeysByPattern('users_awards_list_*'), deleteKeysByPattern('app_user_other_details_*')])
}
async function invalidateProfessionalsFaqCaches(): Promise<void> {
  const { deleteKeysByPattern } = require('../../../config/cache_helper')
  await Promise.all([deleteKeysByPattern('user_faq_list_*'), deleteKeysByPattern('app_user_other_details_*')])
}
function invalidateCompanyStatusCaches(): Promise<void> {
  return require('../../modules/company/settings/company.settings.cache').invalidateBasicDetailsCaches()
}

/**
 * None of the 10 Events sections below have a dedicated per-section cache module yet (unlike
 * Company/Professionals, which each have one). `invalidateEventChangeRequestCaches` covers
 * `individual_event_*` (the per-event detail cache every section's publish affects) plus every
 * list-type section's own per-event Redis cache key (Contact/Speaker/Sponsor-Partner/Ticket/
 * FAQ/Attendee each read through one - see events.cache.ts's own doc comment for the full list
 * and why a document-scope-only invalidator isn't enough for these).
 */
function invalidateEventCaches(): Promise<void> {
  return require('../../modules/events/events.cache').invalidateEventChangeRequestCaches()
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
export const SECTION_PROFESSIONAL_BASIC_DETAILS = 'professional_basic_details'
export const SECTION_PROFESSIONAL_SEO = 'professional_seo'
export const SECTION_PROFESSIONAL_SOCIAL_MEDIA = 'professional_social_media'
export const SECTION_PROFESSIONAL_DETAILS = 'professional_details'
export const SECTION_PROFESSIONAL_INVESTMENT = 'professional_investment'
export const SECTION_PROFESSIONAL_AWARDS = 'professional_awards'
export const SECTION_PROFESSIONAL_FAQ = 'professional_faq'
// Lifecycle actions (Enable/Disable/Delete) on the direct admin-panel record — user-requested
// 2026-09-20 ("the same functionality of approval must be applied to enable, disable... or any
// other status changing of companies or professionals"). Scoped explicitly to the direct
// one-click admin actions only — the pre-existing separate approval queues (Self-Register,
// Manual Retrievals, Claim Requests, Delete-lifecycle) are untouched by this.
export const SECTION_PROFESSIONAL_STATUS = 'professional_status'
export const SECTION_COMPANY_STATUS = 'company_status'

// Events sections (Phase 4, confirmed 2026-09-25) - gated: every section except Collaborations
// (Collaborations isn't part of this migration's scope). Speaker/Sponsor-Partner/Attendee are
// gated on TOP OF (not instead of) their own pre-existing `requested_status` accept/reject review
// - see each section's own doc comment below.
export const SECTION_EVENT_BASIC_DETAILS = 'event_basic_details'
export const SECTION_EVENT_SEO = 'event_seo'
export const SECTION_EVENT_SETTINGS = 'event_settings'
export const SECTION_EVENT_TICKET = 'event_ticket'
export const SECTION_EVENT_COUPON = 'event_coupon'
export const SECTION_EVENT_FAQ = 'event_faq'
export const SECTION_EVENT_CONTACT = 'event_contact'
export const SECTION_EVENT_SPEAKER = 'event_speaker'
export const SECTION_EVENT_SPONSOR_PARTNER = 'event_sponsor_partner'
export const SECTION_EVENT_ATTENDEE = 'event_attendee'
export const SECTION_EVENT_STATUS = 'event_status'

export interface SectionConfig {
  collection: string
  /** The field linking a row to its owning root document (a company or a professional). */
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
  /**
   * Field-level-approval groups (Basic Details/SEO/Social Media UPDATE requests only — see
   * FieldChange.status's doc comment in status-audit.types.ts). Members of the same group key
   * are approved/rejected together as one unit, never independently - e.g. editing a company's
   * location touches city/state/latitude/longitude together; approving latitude alone while
   * rejecting country would leave inconsistent data. Undefined = every field independent
   * (existing behaviour, unaffected for every section that doesn't configure this).
   */
  fieldGroups?: Record<string, string[]>
  /**
   * Opts an UPDATE request on this section into field-level approval (a checkbox per field/group
   * instead of one approve/reject decision for the whole request) - see FieldChange.status's doc
   * comment. Originally gated on `!isList` (document-scope sections only: Basic Details/SEO/
   * Social Media), since every OTHER section's writer either wasn't verified partial-payload-safe
   * or, for Acquisitions specifically, genuinely wasn't (applyAcquisitionWrite used to build
   * `acquisition_date` as `new Date(undefined)` — an Invalid Date, not an omitted field — from any
   * update whose diff didn't touch that field; fixed alongside this flag being set for it). Every
   * section listed here has a confirmed partial-`$set`-safe (or, for Funding Round/Acquisitions,
   * explicitly existing-value-fallback) writer. FAQ and Owned Products are deliberately NOT opted
   * in — never requested, not verified — and stay whole-request.
   */
  fieldLevelApproval?: boolean
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
 * (employment_type, designation_type, location_type, responsibilities, start_date, end_date,
 * positions, position_row_id, position_type, sub_position_row_id, public_view) with create-only
 * "system" fields (user_row_id, user_account_type, company_type, till_date_status, verified_status,
 * verified_on) that must still ride along in the payload so a brand-new team member's pending
 * request produces a valid, functioning row on publish — omitting them would silently drop them
 * and create a row with no linked user or lifecycle state. `company_row_id` is deliberately NOT
 * listed: it's this section's keyField, set automatically from root_document_id.
 *
 * CONFIRMED BUG FIX: `end_date` was missing from this array entirely — computeDiff
 * (change-request.diff.ts) silently skips any submitted field not in editableFields, so a real
 * leaving date typed into the form was submitted correctly by the frontend and
 * adminCreateOrUpdateWorkExperience alike, but never reached the stored change request's payload.
 * A publish then created/updated a row with till_date_status: 1 ("has a leaving date") but no
 * end_date at all, which the UI rendered as "Present" — reproduced live during Professionals-
 * migration QA and fixed here plus in the identical PROFESSIONAL_DETAILS_EDITABLE_FIELDS below.
 */
const TEAM_MEMBERS_EDITABLE_FIELDS = [
  'employment_type',
  'designation_type',
  'location_type',
  'responsibilities',
  'start_date',
  'end_date',
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
 * Same collection/shape as TEAM_MEMBERS_EDITABLE_FIELDS, for the `professional_details` section
 * (keyField `user_row_id` instead of `company_row_id` — see professional-details.label-resolvers.ts's
 * own doc comment). `company_row_id` moves from "excluded, it's the keyField" to a real editable/
 * system field here; `user_row_id` moves the other way.
 */
const PROFESSIONAL_DETAILS_EDITABLE_FIELDS = [
  'employment_type',
  'designation_type',
  'location_type',
  'responsibilities',
  'start_date',
  'end_date',
  'positions',
  'position_row_id',
  'position_type',
  'sub_position_row_id',
  'public_view',
  'company_row_id',
  'user_account_type',
  'company_type',
  'till_date_status',
  'verified_status',
  'verified_on',
] as const

const PROFESSIONALS_AWARDS_EDITABLE_FIELDS = ['award_title', 'award_description', 'award_image'] as const

const PROFESSIONALS_AWARDS_FIELD_LABELS: Record<string, string> = {
  award_title: 'Award Title',
  award_description: 'Award Description',
  award_image: 'Award Image',
}

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
 * Mirrors `updateUserDetails`'s own `mainArray` (professionals.self-service.service.ts) — the
 * exact set of fields that route already `$set`s on a direct write. `email_id`/`mobile_number`/
 * `user_name`/`wallet_address` are handled by their own dedicated self-service routes (own
 * uniqueness/OTP checks), not this one, so they're not listed here either — matching the scope of
 * the one function this section's publish path actually calls into.
 */
const PROFESSIONAL_BASIC_DETAILS_EDITABLE_FIELDS = [
  // CONFIRMED GAP FIX (user-requested, 2026-09-20, "username is not updating in pending
  // changes"): admin edits made `user_name` a plain editable field on the Basic Details form
  // (see CreateUser.tsx), but this whitelist never included it - computeDiff only ever tracks
  // fields present here ("Fails safe: anything absent is never diffed", see SectionConfig's own
  // doc comment), so a changed username was silently dropped before it ever reached a change
  // request, let alone got published.
  'user_name',
  'full_name',
  'gender',
  'account_visible_type',
  'designation_id',
  'about_in_one_line',
  'country_id',
  'country_mobile_id',
  'location',
  'looking_for_id',
  'user_bio',
  'vcf_status',
  'area',
  'city',
  'country_name',
  'state',
  'longitude',
  'latitude',
  'location_country',
] as const

/** Matches the `$lookup` pairs professionals.self-service.service.ts's own aggregation already uses: designation_id -> cln_static_user_designations.designation_name, looking_for_id -> cln_static_user_looking_for_lists.name. */
const resolveDesignationIdList = buildArrayLabelResolver(
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  () => require('../../../models/app/static/user_designationsM'),
  'designation_name',
)
const resolveLookingForIdList = buildArrayLabelResolver(
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  () => require('../../../models/app/static/user_looking_forM'),
  'name',
)

// CONFIRMED GAP FIX (user-requested, 2026-09-20, "I cannot see the public label in it. I just see
// one and two numbers"): `account_visible_type` is a plain 1/2 enum (1 = Private, 2 = Public -
// confirmed against CreateUser.tsx's own `set_account_visible_type(profile.account_visible_type
// === 2)` / `{account_visible_type ? 'Public' : 'Private'}`, and independently against
// controllers/app/link_pages.js:1151's own `account_visible_type === 2` "visible to everyone"
// gate), with no label resolver at all - `computeDiff` fell back to the raw numeric value.
const ACCOUNT_VISIBLE_TYPE_PRIVATE = 1
const ACCOUNT_VISIBLE_TYPE_PUBLIC = 2
const resolveAccountVisibleType: LabelResolver = async (value) => {
  const parsed = Number(value)
  if (parsed === ACCOUNT_VISIBLE_TYPE_PUBLIC) return 'Public'
  if (parsed === ACCOUNT_VISIBLE_TYPE_PRIVATE) return 'Private'
  return null
}

const PROFESSIONAL_BASIC_DETAILS_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  designation_id: resolveDesignationIdList,
  looking_for_id: resolveLookingForIdList,
  account_visible_type: resolveAccountVisibleType,
}

const PROFESSIONAL_BASIC_DETAILS_FIELD_LABELS: Record<string, string> = {
  user_name: 'User Name',
  full_name: 'Full Name',
  gender: 'Gender',
  account_visible_type: 'Profile Visibility',
  designation_id: 'Expertise',
  about_in_one_line: 'About (One Line)',
  location: 'Location',
  looking_for_id: 'Area of Interest',
  user_bio: 'Bio',
  vcf_status: 'VCF Status',
}

/** Only the reviewer-meaningful fields — country/mobile-country ids, area/city/state/lat/long/location_country/created_date_n_time-style bookkeeping stay out of the diff view, same reasoning as BASIC_DETAILS_DISPLAY_FIELDS (Company). */
const PROFESSIONAL_BASIC_DETAILS_DISPLAY_FIELDS = [
  'user_name',
  'full_name',
  'gender',
  'account_visible_type',
  'designation_id',
  'about_in_one_line',
  'location',
  'looking_for_id',
  'user_bio',
] as const

/**
 * Every field the Basic Details tab actually edits (eventM.js) - excludes score/lifecycle/audit
 * fields (`active_status`, `approval_status`, `*_score`, `reason_for_reject`,
 * `rejected_date_n_time`, `disable_reason`, `disabled_date_n_time`, `created_by_admin_status`,
 * `created_by_sub_admin_id`, `created_date_n_time`, `updated_by*`, `view_counts`) and the
 * meta/SEO/robots/og/twitter fields also present on eventM's own schema (these are legacy/unused
 * here - the live Basic Details form and the separate `event_seo` section below both read/write
 * `cln_events_seo_details`, not these duplicate fields on the event document itself).
 */
const EVENT_BASIC_DETAILS_EDITABLE_FIELDS = [
  'event_title',
  'event_tags',
  'event_type',
  'event_image',
  'event_image_type',
  'alt_image_text',
  'event_city',
  'event_state',
  'event_venue',
  'event_url',
  'event_link',
  'ticket_link',
  'start_date',
  'end_date',
  'event_description',
  'event_brief',
  'describe_in_one_line',
  'contact_user_name',
  'contact_mobile_number',
  'contact_country_row_id',
  'contact_email_id',
  'webinar_meeting_type',
  'webinar_meeting_link',
  'list_event_type',
  'longitude',
  'latitude',
  'utc_row_id',
  'event_card_image',
] as const

const EVENT_BASIC_DETAILS_FIELD_LABELS: Record<string, string> = {
  event_title: 'Event Title',
  event_tags: 'Event Tags',
  event_type: 'Event Type',
  event_image: 'Event Image',
  event_image_type: 'Event Image Type',
  alt_image_text: 'Image Alt Text',
  event_city: 'City',
  event_state: 'State',
  event_venue: 'Venue',
  event_url: 'Event URL',
  event_link: 'Event Link',
  ticket_link: 'Ticket Link',
  start_date: 'Start Date',
  end_date: 'End Date',
  event_description: 'Event Description',
  event_brief: 'Event Brief',
  describe_in_one_line: 'Describe In One Line',
  contact_user_name: 'Contact Name',
  contact_mobile_number: 'Contact Mobile Number',
  contact_country_row_id: 'Contact Country',
  contact_email_id: 'Contact Email',
  webinar_meeting_type: 'Meeting Link Type',
  webinar_meeting_link: 'Meeting Link',
  list_event_type: 'Event Listing Type',
  longitude: 'Longitude',
  latitude: 'Latitude',
  utc_row_id: 'Timezone',
  event_card_image: 'Event Card Image',
}

const EVENT_SETTINGS_EDITABLE_FIELDS = [
  'link_user_register_status',
  'link_attendee_list_status',
  'link_speaker_status',
  'link_partner_status',
  'link_sponsor_status',
  'link_ticket_status',
] as const

const EVENT_SETTINGS_FIELD_LABELS: Record<string, string> = {
  link_user_register_status: 'Show Register Link',
  link_attendee_list_status: 'Show Attendee List',
  link_speaker_status: 'Show Speakers',
  link_partner_status: 'Show Partners',
  link_sponsor_status: 'Show Sponsors',
  link_ticket_status: 'Show Tickets',
}

const EVENT_TICKET_EDITABLE_FIELDS = ['title', 'benefits', 'ticket_type', 'price', 'sell_status', 'active_status'] as const

const EVENT_TICKET_FIELD_LABELS: Record<string, string> = {
  title: 'Ticket Title',
  benefits: 'Benefits',
  ticket_type: 'Ticket Type',
  price: 'Price',
  sell_status: 'Sell Status',
  active_status: 'Active Status',
}

const EVENT_COUPON_EDITABLE_FIELDS = ['coupon_code', 'discount'] as const

const EVENT_COUPON_FIELD_LABELS: Record<string, string> = {
  coupon_code: 'Coupon Code',
  discount: 'Discount',
}

const EVENT_CONTACT_EDITABLE_FIELDS = ['country_id', 'contact_number', 'email_id', 'contact_type', 'contact_reason'] as const

const EVENT_CONTACT_FIELD_LABELS: Record<string, string> = {
  country_id: 'Country',
  contact_number: 'Contact Number',
  email_id: 'Email',
  contact_type: 'Contact Type',
  contact_reason: 'Contact Reason',
}

/**
 * `requested_status` is BOTH this section's own pre-existing accept/reject state (0: Pending,
 * 1: Accepted, 2: Rejected, 3: Host added - see event_speakersM.js) AND, per user decision
 * 2026-09-25, now also a change-request-gated field on top of that: adding/editing a speaker
 * stages a pending request first, and its own accept/reject review happens independently once the
 * add/edit itself is published live. The two states are orthogonal, not a conflict.
 */
const EVENT_SPEAKER_EDITABLE_FIELDS = ['user_type', 'user_row_id', 'requested_status'] as const

const EVENT_SPEAKER_FIELD_LABELS: Record<string, string> = {
  user_type: 'Speaker Type',
  user_row_id: 'Speaker',
  requested_status: 'Request Status',
}

/** Same `requested_status` reasoning as Speaker above (event_sponsors_partner_detailsM.js). */
const EVENT_SPONSOR_PARTNER_EDITABLE_FIELDS = [
  'category_row_id',
  'sponsor_partner_type',
  'account_type',
  'registered_type',
  'user_company_row_id',
  'sponsorship_type_title',
  'requested_status',
  'sponsors_ids',
] as const

const EVENT_SPONSOR_PARTNER_FIELD_LABELS: Record<string, string> = {
  category_row_id: 'Category',
  sponsor_partner_type: 'Sponsor/Partner Type',
  account_type: 'Account Type',
  registered_type: 'Registered Type',
  user_company_row_id: 'Sponsor/Partner',
  sponsorship_type_title: 'Sponsorship Type',
  requested_status: 'Request Status',
  sponsors_ids: 'Sponsors',
}

/** Same `requested_status`-is-orthogonal reasoning as Speaker/Sponsor-Partner above (event_attendeesM.js's own `invitation_status`, not `requested_status` - Attendees never had that field, only Speaker/Sponsor-Partner do). */
const EVENT_ATTENDEE_EDITABLE_FIELDS = [
  'user_type',
  'user_row_id',
  'email_day_number',
  'invitation_status',
  'invitation_type',
  'reminder_type',
  'reminder_time',
] as const

const EVENT_ATTENDEE_FIELD_LABELS: Record<string, string> = {
  user_type: 'Attendee Type',
  user_row_id: 'Attendee',
  email_day_number: 'Reminder Email Day',
  invitation_status: 'Invitation Status',
  invitation_type: 'Invitation Type',
  reminder_type: 'Reminder Type',
  reminder_time: 'Reminder Time',
}

/**
 * Section whitelist. Section names arrive from request input, so they resolve through this map —
 * never via a dynamic model lookup, per the backend CLAUDE.md.
 *
 * `editableFields` deliberately excludes computed fields (seo_details_score, profile_score) and
 * the key field: cron jobs and score recalculation write those, and including them would fill
 * the approval queue with changes nobody made (design §7.1).
 */
export const SECTION_REGISTRY = {
  [SECTION_SEO]: {
    collection: 'cln_company_seo_details',
    keyField: 'company_row_id',
    isList: false,
    editableFields: SEO_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: SEO_FIELD_LABELS,
    schemaPaths: (field: string) => company_seo_detailsM.schema.path(field),
    invalidateCache: (rootDocumentId: number) => invalidateSeoCaches(rootDocumentId),
    fieldLevelApproval: true,
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
    fieldLevelApproval: true,
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
    fieldLevelApproval: true,
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
    fieldLevelApproval: true,
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
    fieldLevelApproval: true,
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
    fieldLevelApproval: true,
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
    fieldGroups: {
      location: ['company_location', 'city', 'state', 'latitude', 'longitude'],
      business_model: ['main_business_model_id', 'business_model_id'],
    },
    fieldLevelApproval: true,
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
    fieldLevelApproval: true,
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
    // Safe under a partial (field-level-filtered) payload already - applyFundingRoundWrite's
    // update branch falls back to each row's existing value for any field this submission's diff
    // didn't touch (see that function's own "CONFIRMED BUG FIX" comment), so a reviewer approving
    // only `amount` while `investors` stays pending doesn't blank the round's other fields.
    fieldLevelApproval: true,
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
    // applyAcquisitionWrite's update branch now falls back to the row's existing value for any
    // field this submission's diff didn't touch (matching Funding Round's own pattern) - see that
    // function's own "CONFIRMED BUG FIX" comment for the Invalid Date corruption this fixes.
    fieldLevelApproval: true,
  },
  [SECTION_PROFESSIONAL_BASIC_DETAILS]: {
    // The professional document IS the root document here, same as Company's own SECTION_BASIC_
    // DETAILS — keyField '_id' lets the generic applyDocumentWrite update-or-create in one call.
    collection: 'cln_professionals',
    keyField: '_id',
    isList: false,
    editableFields: PROFESSIONAL_BASIC_DETAILS_EDITABLE_FIELDS,
    labelResolvers: PROFESSIONAL_BASIC_DETAILS_LABEL_RESOLVERS,
    fieldLabels: PROFESSIONAL_BASIC_DETAILS_FIELD_LABELS,
    displayFields: PROFESSIONAL_BASIC_DETAILS_DISPLAY_FIELDS,
    schemaPaths: (field: string) => professionalsM.schema.path(field),
    invalidateCache: () => invalidateProfessionalsCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_PROFESSIONAL_SEO]: {
    collection: 'cln_professionals_seo_details',
    keyField: 'user_row_id',
    isList: false,
    editableFields: SEO_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: SEO_FIELD_LABELS,
    schemaPaths: (field: string) => professionals_seo_detailsM.schema.path(field),
    invalidateCache: () => invalidateProfessionalsSeoCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_PROFESSIONAL_SOCIAL_MEDIA]: {
    collection: 'cln_professionals_social_links',
    keyField: 'user_row_id',
    isList: false,
    editableFields: SOCIAL_MEDIA_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: SOCIAL_MEDIA_FIELD_LABELS,
    schemaPaths: (field: string) => professionals_social_linksM.schema.path(field),
    invalidateCache: () => invalidateProfessionalsSocialLinksCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_PROFESSIONAL_DETAILS]: {
    // Same collection as Company's SECTION_TEAM_MEMBERS, scoped by `user_row_id` instead of
    // `company_row_id` — every row carries both fields independently, so keyField-scoped queries
    // never cross-match (confirmed against the schema, see the plan's own note on this section).
    collection: 'cln_professionals_work_experiences',
    keyField: 'user_row_id',
    isList: true,
    editableFields: PROFESSIONAL_DETAILS_EDITABLE_FIELDS,
    labelResolvers: PROFESSIONAL_DETAILS_LABEL_RESOLVERS,
    fieldLabels: PROFESSIONAL_DETAILS_FIELD_LABELS,
    displayFields: PROFESSIONAL_DETAILS_DISPLAY_FIELDS,
    schemaPaths: (field: string) => professionals_work_experienceM.schema.path(field),
    invalidateCache: () => invalidateProfessionalDetailsCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_PROFESSIONAL_INVESTMENT]: {
    // Same collection as Company's SECTION_INVESTMENT. No extraMatch/investor_type guard needed:
    // applyChildWrite's UPDATE/DELETE match by `_id` (never by keyField), and CREATE relies on the
    // submitted payload's own `investor_type` (already an editable "system field" here, set by the
    // submitting service, not the registry) — confirmed via change-request.apply.writers.ts, so a
    // company row and a professional row can never cross-match even sharing investor_row_id space.
    collection: 'cln_funding_investment_lists',
    keyField: 'investor_row_id',
    isList: true,
    editableFields: INVESTMENT_EDITABLE_FIELDS,
    labelResolvers: INVESTMENT_LABEL_RESOLVERS,
    fieldLabels: INVESTMENT_FIELD_LABELS,
    displayFields: INVESTMENT_DISPLAY_FIELDS,
    schemaPaths: (field: string) => fundingInvestmentM.schema.path(field),
    invalidateCache: () => invalidateFundingCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_PROFESSIONAL_AWARDS]: {
    collection: 'cln_professionals_awards',
    keyField: 'user_row_id',
    isList: true,
    editableFields: PROFESSIONALS_AWARDS_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: PROFESSIONALS_AWARDS_FIELD_LABELS,
    schemaPaths: (field: string) => professionals_awardsM.schema.path(field),
    invalidateCache: () => invalidateProfessionalsAwardsCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_PROFESSIONAL_FAQ]: {
    collection: 'cln_professionals_faq_lists',
    keyField: 'user_row_id',
    isList: true,
    editableFields: FAQ_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: FAQ_FIELD_LABELS,
    schemaPaths: (field: string) => professionals_faqM.schema.path(field),
    invalidateCache: () => invalidateProfessionalsFaqCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_PROFESSIONAL_STATUS]: {
    // No field diffing here at all — the request's payload is a control instruction
    // ({intended_action: 'enable'|'disable'|'delete', reason_for_disable?}), not a set of
    // editable professional fields, so editableFields/schemaPaths are never actually consulted
    // (submission bypasses computeDiff, going straight through insertChangeRequest — see
    // professionals.lifecycle-request.service.ts). customWriter routes the whole publish to
    // applyProfessionalStatusWrite, which reproduces enableUser/disableUser/deleteUser's real
    // side effects (company/podcast/events cascade, hard delete) inside the publish transaction.
    collection: 'cln_professionals',
    keyField: '_id',
    isList: false,
    editableFields: [],
    labelResolvers: {},
    schemaPaths: (field: string) => professionalsM.schema.path(field),
    customWriter: true,
    invalidateCache: () => invalidateProfessionalsCaches(),
  },
  [SECTION_COMPANY_STATUS]: {
    // Same shape as SECTION_PROFESSIONAL_STATUS above, for Company's own Enable/Disable/Delete.
    collection: 'cln_company_lists',
    keyField: '_id',
    isList: false,
    editableFields: [],
    labelResolvers: {},
    schemaPaths: (field: string) => companyM.schema.path(field),
    customWriter: true,
    // Reuses Basic Details' own cache invalidation (app_company_list_*/app_company_individual_
    // details_*/shared caches) - the exact same reads (company list, individual details) go stale
    // after an enable/disable/delete as after any other company field change.
    invalidateCache: () => invalidateCompanyStatusCaches(),
  },
  [SECTION_EVENT_STATUS]: {
    // No field diffing here at all - the request's payload is a control instruction
    // ({intended_action: 'enable'|'disable'|'approve'|'reject', reason?}), not a set of editable
    // event fields, so editableFields/schemaPaths are never actually consulted (submission
    // bypasses computeDiff, going straight through insertChangeRequest - see
    // events.lifecycle-request.service.ts). customWriter routes the whole publish to
    // applyEventStatusWrite, which reproduces the former enableEvent/disableEvent/approveEvent/
    // rejectEvent's real side effects inside the publish transaction. Same shape as
    // SECTION_COMPANY_STATUS/SECTION_PROFESSIONAL_STATUS above.
    collection: 'cln_events',
    keyField: '_id',
    isList: false,
    editableFields: [],
    labelResolvers: {},
    schemaPaths: (field: string) => eventM.schema.path(field),
    customWriter: true,
    invalidateCache: () => invalidateEventCaches(),
  },
  [SECTION_EVENT_BASIC_DETAILS]: {
    // The event document IS the root document here, same as Company's own SECTION_BASIC_DETAILS
    // - keyField '_id' lets the generic applyDocumentWrite update-or-create in one call.
    collection: 'cln_events',
    keyField: '_id',
    isList: false,
    editableFields: EVENT_BASIC_DETAILS_EDITABLE_FIELDS,
    labelResolvers: EVENT_BASIC_DETAILS_LABEL_RESOLVERS,
    fieldLabels: EVENT_BASIC_DETAILS_FIELD_LABELS,
    schemaPaths: (field: string) => eventM.schema.path(field),
    fieldGroups: {
      location: ['event_venue', 'event_city', 'event_state', 'latitude', 'longitude'],
    },
    invalidateCache: () => invalidateEventCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_EVENT_SEO]: {
    collection: 'cln_events_seo_details',
    keyField: 'event_row_id',
    isList: false,
    // Same field set as Company/Professional SEO (SEO_EDITABLE_FIELDS/SEO_FIELD_LABELS above) -
    // event_seo_detailsM.js's schema matches field-for-field, so it's reused rather than
    // duplicated.
    editableFields: SEO_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: SEO_FIELD_LABELS,
    schemaPaths: (field: string) => event_seo_detailsM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
    fieldLevelApproval: true,
  },
  [SECTION_EVENT_SETTINGS]: {
    collection: 'cln_events_link_display_details',
    keyField: 'event_row_id',
    isList: false,
    editableFields: EVENT_SETTINGS_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: EVENT_SETTINGS_FIELD_LABELS,
    schemaPaths: (field: string) => event_link_display_detailsM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
    // Each toggle is independent - no grouping needed, unlike Basic Details' location group.
    fieldLevelApproval: true,
  },
  [SECTION_EVENT_TICKET]: {
    collection: 'cln_event_tickets',
    keyField: 'event_row_id',
    isList: true,
    editableFields: EVENT_TICKET_EDITABLE_FIELDS,
    labelResolvers: EVENT_TICKET_LABEL_RESOLVERS,
    fieldLabels: EVENT_TICKET_FIELD_LABELS,
    schemaPaths: (field: string) => ticketM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
  },
  [SECTION_EVENT_COUPON]: {
    collection: 'cln_event_coupons',
    keyField: 'event_row_id',
    isList: true,
    editableFields: EVENT_COUPON_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: EVENT_COUPON_FIELD_LABELS,
    schemaPaths: (field: string) => couponM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
  },
  [SECTION_EVENT_FAQ]: {
    collection: 'cln_events_faq_lists',
    keyField: 'event_row_id',
    isList: true,
    // Same field set as Company/Professional FAQ (FAQ_EDITABLE_FIELDS/FAQ_FIELD_LABELS above) -
    // event_faqM.js's schema matches field-for-field, so it's reused rather than duplicated.
    editableFields: FAQ_EDITABLE_FIELDS,
    labelResolvers: {},
    fieldLabels: FAQ_FIELD_LABELS,
    schemaPaths: (field: string) => event_faq_listsM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
  },
  [SECTION_EVENT_CONTACT]: {
    collection: 'cln_event_contacts',
    keyField: 'event_row_id',
    isList: true,
    editableFields: EVENT_CONTACT_EDITABLE_FIELDS,
    labelResolvers: EVENT_CONTACT_LABEL_RESOLVERS,
    fieldLabels: EVENT_CONTACT_FIELD_LABELS,
    schemaPaths: (field: string) => event_contactsM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
  },
  [SECTION_EVENT_SPEAKER]: {
    collection: 'cln_events_speakers',
    keyField: 'event_row_id',
    isList: true,
    editableFields: EVENT_SPEAKER_EDITABLE_FIELDS,
    labelResolvers: EVENT_SPEAKER_LABEL_RESOLVERS,
    fieldLabels: EVENT_SPEAKER_FIELD_LABELS,
    schemaPaths: (field: string) => event_speakersM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
  },
  [SECTION_EVENT_SPONSOR_PARTNER]: {
    collection: 'cln_event_sponsor_partner_details',
    keyField: 'event_row_id',
    isList: true,
    editableFields: EVENT_SPONSOR_PARTNER_EDITABLE_FIELDS,
    labelResolvers: EVENT_SPONSOR_PARTNER_LABEL_RESOLVERS,
    fieldLabels: EVENT_SPONSOR_PARTNER_FIELD_LABELS,
    schemaPaths: (field: string) => event_sponsors_partner_detailsM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
  },
  [SECTION_EVENT_ATTENDEE]: {
    collection: 'cln_events_attendees',
    keyField: 'event_row_id',
    isList: true,
    editableFields: EVENT_ATTENDEE_EDITABLE_FIELDS,
    labelResolvers: EVENT_ATTENDEE_LABEL_RESOLVERS,
    fieldLabels: EVENT_ATTENDEE_FIELD_LABELS,
    schemaPaths: (field: string) => event_attendeesM.schema.path(field),
    invalidateCache: () => invalidateEventCaches(),
  },
} as const satisfies Record<string, SectionConfig>

export type KnownSection = keyof typeof SECTION_REGISTRY

export const isKnownSection = (value: string): value is KnownSection =>
  Object.prototype.hasOwnProperty.call(SECTION_REGISTRY, value)
