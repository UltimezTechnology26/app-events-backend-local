// modules/events/events.view.service.ts
//
// Ports controllers/admin_panel/events/event.js's GET /view_event/:request_row_id (8288).
//
// CONFIRMED PERF FIX: the legacy handler awaited, in sequence: the country lookup, the
// event_link_display_details lookup, the tickets find, the contact_details aggregate, the
// speakers aggregate, and the sponsors_partners aggregate — six independent reads, none of which
// depends on any other's result (each only needs checkEvent[0]._id / contact_country_row_id,
// already known upfront). Fixed here with one Promise.all instead of six sequential round-trips.
import { EventM } from './events.models'
const event_faqM = require('../../../models/app/events/event_faqM')
const ticketM = require('../../../models/app/events/ticketM')
const countryM = require('../../../models/app/static/countryM')
const event_link_display_detailsM = require('../../../models/app/events/event_link_display_detailsM')
const event_contactsM = require('../../../models/app/events/event_contactsM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
import { buildViewEventMainPipeline, buildContactDetailsPipeline, buildSpeakersPipeline, buildSponsorsPartnersPipeline } from './events.view.queries'

export async function getEventView(requestRowId: number) {
  const checkEvent = await EventM.aggregate(buildViewEventMainPipeline(requestRowId))
  if (!checkEvent[0]) {
    return { status: false, message: { alert_message: 'Invalid Request Row Id' } }
  }

  const event = checkEvent[0]
  const result: Record<string, unknown> = {
    _id: event._id,
    user_row_id: event.user_row_id,
    company_row_id: event.company_row_id,
    event_tag_array: event.event_tag_array,
    list_event_type: event.list_event_type,
    event_title: event.event_title,
    event_tags: event.event_tags,
    event_type: event.event_type,
    event_image: event.event_image,
    event_image_type: event.event_image_type,
    event_city: event.event_city,
    ticket_link: event.ticket_link,
    event_state: event.event_state,
    event_venue: event.event_venue,
    event_url: event.event_url,
    event_link: event.event_link,
    start_date: event.start_date,
    end_date: event.end_date,
    event_price: event.event_price,
    event_description: event.event_description,
    event_brief: event.event_brief,
    contact_mobile_number: event.contact_mobile_number,
    contact_email_id: event.contact_email_id,
    active_status: event.active_status,
    approval_status: event.approval_status,
    reason_for_reject: event.reason_for_reject,
    rejected_date_n_time: event.rejected_date_n_time,
    disable_reason: event.disable_reason,
    disabled_date_n_time: event.disabled_date_n_time,
    created_by_admin_status: event.created_by_admin_status,
    created_by_sub_admin_id: event.created_by_sub_admin_id,
    created_date_n_time: event.created_date_n_time,
    sub_admin_name: event.sub_admin_name,
    meta_keywords: event.meta_keywords,
    meta_description: event.meta_description,
    meta_title: event.meta_title,
    user_name: event.user_name,
    full_name: event.full_name,
    email_id: event.email_id,
    company_id: event.company_id,
    company_name: event.company_name,
    webinar_meeting_type: event.webinar_meeting_type,
    webinar_meeting_link: event.webinar_meeting_link,
    longitude: event.longitude,
    latitude: event.latitude,
    company_email_id: event.company_email_id,
    about_company: event.about_company,
    user_bio: event.user_bio,
    utc_time: event.utc_time,
    timezone: event.timezone,
    utc_row_id: event.utc_row_id,
    country: event.country,
    alt_image_text: event.alt_image_text,
    contact_country_row_id: event.contact_country_row_id,
    build_event_page_score: event.build_event_page_score,
    seo_details_score: event.seo_details_score,
    contact_details_score: event.contact_details_score,
    tickets_coupons_score: event.tickets_coupons_score,
    speakers_score: event.speakers_score,
    sponsors_partners_score: event.sponsors_partners_score,
    attendees_score: event.attendees_score,
    faq_score: event.faq_score,
    profile_score: event.profile_score,
    updated_by: event.updated_by,
    updated_by_row_id: event.updated_by_row_id,
    updated_by_full_name: event.updated_by_full_name,
    updated_date_n_time: event.updated_date_n_time,
    event_tags_array: event.event_tags_array,
    link_user_register_status: true,
    link_attendee_list_status: true,
    link_speaker_status: true,
    link_partner_status: true,
    link_sponsor_status: true,
    link_ticket_status: true,
    link_contact_status: true,
  }

  const [countryQuery, linkDisplayDetails, tickets, faqs, contactDetails, speakers, sponsorsPartners] = await Promise.all([
    event.contact_country_row_id ? countryM.findOne({ _id: event.contact_country_row_id }) : Promise.resolve(null),
    event_link_display_detailsM.findOne({ event_row_id: event._id }),
    ticketM.find({ event_row_id: event._id }),
    event_faqM.find({ event_row_id: event._id }),
    event_contactsM.aggregate(buildContactDetailsPipeline(event._id)),
    event_speakersM.aggregate(buildSpeakersPipeline(event._id)),
    event_sponsors_partner_detailsM.aggregate(buildSponsorsPartnersPipeline(event._id)),
  ])

  if (countryQuery) {
    result['country_data'] = countryQuery
  }
  if (linkDisplayDetails) {
    result['link_user_register_status'] = linkDisplayDetails.link_user_register_status
    result['link_attendee_list_status'] = linkDisplayDetails.link_attendee_list_status
    result['link_speaker_status'] = linkDisplayDetails.link_speaker_status
    result['link_partner_status'] = linkDisplayDetails.link_partner_status
    result['link_sponsor_status'] = linkDisplayDetails.link_sponsor_status
    result['link_ticket_status'] = linkDisplayDetails.link_ticket_status
    result['link_contact_status'] = linkDisplayDetails.link_contact_status
  }

  result['event_faqs'] = faqs
  result['tickets'] = tickets
  result['contact_details'] = contactDetails.length > 0 ? contactDetails : []
  result['speakers_usernames'] = speakers.map((s: { user_row_id: number; user_type: number }) => ({ user_row_id: s.user_row_id, user_type: s.user_type }))
  result['speakers_array'] = speakers
  result['sponsors_partners'] = sponsorsPartners.length > 0 ? sponsorsPartners : []

  return { status: true, message: result }
}
