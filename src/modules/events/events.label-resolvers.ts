import { LabelResolver } from '../../modules/change-request/change-request.diff'
import {
  buildArrayLabelResolver,
  buildEnumLabelResolver,
  buildSingleLabelResolver,
  resolveCountryName,
} from '../../modules/change-request/change-request.common-resolvers'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const resolveEventTagNames = buildArrayLabelResolver(() => require('../../../models/app/static/event_tagsM'), 'event_tag')

/** Matches EVENT_TYPE_OPTIONS in frontend-events-typescript's events-admin.constants.ts (ported from admin-coinpedia's legacy event_type_list). */
const resolveEventTypeLabel = buildEnumLabelResolver({
  1: 'Seminar',
  2: 'Webinar',
  3: 'Hybrid',
  4: 'Conference',
  5: 'Summit',
  6: 'Expo',
  7: 'Workshop',
  8: 'Hackathon',
})

/** `event_image_type` is a genuine foreign key into cln_events_default_images (events.edit.service.ts's own `event_default_imagesM.findOne({_id: ...})` lookup), not a small fixed enum. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const resolveEventImageTypeName = buildSingleLabelResolver(() => require('../../../models/app/static/event_default_imagesM'), 'image_name')

/** `utc_row_id` is a foreign key into cln_events_utc_dates (event_utc_datesM) - resolves to the stored IANA/offset timezone string. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const resolveEventUtcTimezoneName = buildSingleLabelResolver(() => require('../../../models/app/events/event_utc_datesM'), 'timezone')

/** Matches `online_meeting_types` (frontend-events-typescript's src/utils/online_meeting_types.ts) - a hardcoded frontend array, not a DB-backed lookup collection. */
const resolveWebinarMeetingTypeLabel = buildEnumLabelResolver({
  1: 'Youtube',
  2: 'Google',
  3: 'Twitch',
  4: 'Meet-Up',
  5: 'Zoom',
  6: 'Skype',
})

/**
 * `list_event_type` values (admin-organizer.types.ts's own LIST_EVENT_TYPE_* constants,
 * confirmed against useAdminOrganizer.ts's resolveSelection - legacy's 4-8 branches were
 * unreachable duplicates of 2, so only 0-3 are ever produced).
 */
const resolveListEventTypeLabel = buildEnumLabelResolver({
  0: 'None',
  1: 'User (Self-Service)',
  2: 'Company',
  3: 'User and Company',
})

export const EVENT_BASIC_DETAILS_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  event_tags: resolveEventTagNames,
  event_type: resolveEventTypeLabel,
  event_image_type: resolveEventImageTypeName,
  contact_country_row_id: resolveCountryName,
  webinar_meeting_type: resolveWebinarMeetingTypeLabel,
  list_event_type: resolveListEventTypeLabel,
  utc_row_id: resolveEventUtcTimezoneName,
}

/** `ticket_type` (ticketM.js's own schema comment: 1 = paid, 2 = free). */
const resolveTicketTypeLabel = buildEnumLabelResolver({ 1: 'Paid', 2: 'Free' })
/** `sell_status` (ticketM.js's own schema comment: 1 = Sold). */
const resolveTicketSellStatusLabel = buildEnumLabelResolver({ 0: 'Available', 1: 'Sold' })
/** `active_status` (ticketM.js's own schema comment: 0 = Disabled, 1 = Enabled). */
const resolveTicketActiveStatusLabel = buildEnumLabelResolver({ 0: 'Disabled', 1: 'Enabled' })

export const EVENT_TICKET_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  ticket_type: resolveTicketTypeLabel,
  sell_status: resolveTicketSellStatusLabel,
  active_status: resolveTicketActiveStatusLabel,
}

/** `contact_type` is a foreign key into cln_static_event_contact_types (event_contact_typesM), not a fixed enum - confirmed via contact-details.tsx's own `getContactTypes()` API-backed dropdown. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const resolveEventContactTypeName = buildSingleLabelResolver(() => require('../../../models/app/static/event_contact_typesM'), 'contact_type_name')

export const EVENT_CONTACT_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  country_id: resolveCountryName,
  contact_type: resolveEventContactTypeName,
}

/**
 * `user_type` (event_speakersM.js's own schema comment: 1 = registered user (cln_professionals),
 * 2 = manual speaker (cln_professionals_manual_retrievals)). Same shape reused for Attendee below.
 */
const resolveSpeakerTypeLabel = buildEnumLabelResolver({ 1: 'Registered User', 2: 'Manual Speaker' })
const resolveAttendeeTypeLabel = buildEnumLabelResolver({ 1: 'Registered User', 2: 'Manual Retrieval' })

/**
 * Resolves a Speaker/Attendee's `user_row_id` to its display name, branching on the sibling
 * `user_type` field sitting in the same record (same "full context already available, no
 * try-then-fallback guessing" reasoning as funding.label-resolvers.ts's resolveInvestorRowName).
 * All requires are lazy, same reasoning as change-request.common-resolvers.ts.
 */
const resolveEventPersonName: LabelResolver = async (value, record) => {
  const row_id = Number(value)
  if (!row_id) return null
  const user_type = Number(record?.['user_type'])
  /* eslint-disable @typescript-eslint/no-var-requires */
  const model = user_type === 2 ? require('../../../models/app/users/professionals_manual_retrievalsM') : require('../../../models/app/professionalsM')
  /* eslint-enable @typescript-eslint/no-var-requires */
  const doc = await model.findById(row_id).select('full_name').lean()
  return doc?.full_name ?? null
}

export const EVENT_SPEAKER_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  user_type: resolveSpeakerTypeLabel,
  user_row_id: resolveEventPersonName,
  // 0: Pending, 1: Accepted, 2: Rejected, 3: Host added (event_speakersM.js's own schema comment).
  requested_status: buildEnumLabelResolver({ 0: 'Pending', 1: 'Accepted', 2: 'Rejected', 3: 'Host Added' }),
}

export const EVENT_ATTENDEE_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  user_type: resolveAttendeeTypeLabel,
  user_row_id: resolveEventPersonName,
  // 0: invitation pending, 1: Accepted, 2: rejected (event_attendeesM.js's own schema comment).
  invitation_status: buildEnumLabelResolver({ 0: 'Pending', 1: 'Accepted', 2: 'Rejected' }),
  // 1: User registered, 2: Added by host (event_attendeesM.js's own schema comment).
  invitation_type: buildEnumLabelResolver({ 1: 'User Registered', 2: 'Added by Host' }),
  // `reminder_type` deliberately left unresolved - no confirmed value domain in either the schema
  // comment or the frontend (grepped, no UI reference found) - flagged for follow-up rather than
  // guessed at.
}

/** `sponsor_partner_type` (event_sponsors_partner_detailsM.js's own schema comment: 1 = Sponsor, 2 = Partner). */
const resolveSponsorPartnerTypeLabel = buildEnumLabelResolver({ 1: 'Sponsor', 2: 'Partner' })
/** `account_type` (event_sponsors_partner_detailsM.js's own schema comment: 1 = User, 2 = Company). */
const resolveSponsorAccountTypeLabel = buildEnumLabelResolver({ 1: 'User', 2: 'Company' })
/** `registered_type` (event_sponsors_partner_detailsM.js's own schema comment: 1 = Registered, 2 = Manual). */
const resolveSponsorRegisteredTypeLabel = buildEnumLabelResolver({ 1: 'Registered', 2: 'Manual' })

/**
 * `category_row_id` resolves against ONE of two different static collections depending on the
 * sibling `sponsor_partner_type` field (1: cln_static_event_sponsor_categories.sponsorship_name,
 * 2: cln_static_event_partner_categories.partnership_name) - confirmed against
 * sponsors_n_partners.js's own GET /individual_details aggregation (its `info_sponsor_category`/
 * `info_partner_category` $lookups gate on this exact same field).
 */
const resolveSponsorPartnerCategoryName: LabelResolver = async (value, record) => {
  const row_id = Number(value)
  if (!row_id) return null
  const sponsor_partner_type = Number(record?.['sponsor_partner_type'])
  if (sponsor_partner_type === 1) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const event_sponsor_categoriesM = require('../../../models/app/static/event_sponsor_categoriesM')
    const doc = await event_sponsor_categoriesM.findById(row_id).select('sponsorship_name').lean()
    return doc?.sponsorship_name ?? null
  }
  if (sponsor_partner_type === 2) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const event_partners_categoriesM = require('../../../models/app/static/event_partners_categoriesM')
    const doc = await event_partners_categoriesM.findById(row_id).select('partnership_name').lean()
    return doc?.partnership_name ?? null
  }
  return null
}

/**
 * Resolves `user_company_row_id` to its display name, branching on the sibling `account_type`/
 * `registered_type` pair sitting in the same record - the exact 4-way branch
 * sponsors_n_partners.js's own POST handler already validates against (account_type 1/2 x
 * registered_type 1/2 -> professionalsM / professionals_manual_retrievalsM / companyM /
 * company_manual_retrievalsM). All requires are lazy, same reasoning as
 * change-request.common-resolvers.ts.
 */
const resolveSponsorPartnerCompanyOrPersonName: LabelResolver = async (value, record) => {
  const row_id = Number(value)
  if (!row_id) return null
  const account_type = Number(record?.['account_type'])
  const registered_type = Number(record?.['registered_type'])
  /* eslint-disable @typescript-eslint/no-var-requires */
  if (account_type === 1) {
    const model = registered_type === 2 ? require('../../../models/app/users/professionals_manual_retrievalsM') : require('../../../models/app/professionalsM')
    const doc = await model.findById(row_id).select('full_name').lean()
    return doc?.full_name ?? null
  }
  const model = registered_type === 2 ? require('../../../models/app/company/company_manual_retrievalsM') : require('../../../models/app/company/companyM')
  const doc = await model.findById(row_id).select('company_name').lean()
  return doc?.company_name ?? null
  /* eslint-enable @typescript-eslint/no-var-requires */
}

export const EVENT_SPONSOR_PARTNER_LABEL_RESOLVERS: Record<string, LabelResolver> = {
  category_row_id: resolveSponsorPartnerCategoryName,
  sponsor_partner_type: resolveSponsorPartnerTypeLabel,
  account_type: resolveSponsorAccountTypeLabel,
  registered_type: resolveSponsorRegisteredTypeLabel,
  user_company_row_id: resolveSponsorPartnerCompanyOrPersonName,
  // 0: pending, 1: approved, 2: rejected (event_sponsors_partner_detailsM.js's own schema comment);
  // 3 (schema default) matches Speaker's own "Host added" sentinel - same field, same convention.
  requested_status: buildEnumLabelResolver({ 0: 'Pending', 1: 'Approved', 2: 'Rejected', 3: 'Host Added' }),
  // `sponsors_ids` deliberately left unresolved - schema types it as a bare `Object` with no
  // documented shape, and its only other call site (collaboration.js) treats it as a raw id array
  // in a way that doesn't obviously match this section's own usage - flagged for follow-up rather
  // than guessed at.
}
