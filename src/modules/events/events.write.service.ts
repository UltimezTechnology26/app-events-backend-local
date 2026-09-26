// modules/events/events.write.service.ts
//
// Ports controllers/admin_panel/events/event.js's POST /delete_event/:request_row_id (7959).
// Behavior preserved (same email templates, same notification calls, same response shapes).
// Enable/Disable used to live here too (GET /enable_event (7729), POST /disable_event (7842)) -
// moved to events.lifecycle-request.service.ts/events.lifecycle-apply.ts 2026-09-26 (staged
// behind the pending -> approve -> publish flow, matching Company/Professional's own Enable/
// Disable - see events.lifecycle-apply.ts's own doc comment). Delete stays here, untouched,
// out of scope for that change.
//
// CONFIRMED PERF FIX (delete): the legacy delete path (utils/helpers/events_helper.js:1613
// deleteEvent) ran ~5 independent existence-check reads (attendees/faq/tickets/
// sponsors_partners/watchlist) and several independent unconditional deletes
// (event_seo_detailsM, event_speakersM, notify_userM, events_countM) one at a time, sequentially
// awaited, even though none of them depends on another's result — a textbook
// Promise.all candidate (CLAUDE.md: "no DB calls inside loops... batch or join"). Fixed here by
// running the independent existence checks together, then the independent unconditional deletes
// together, then the conditional cleanup helpers together.
const eventM_legacy = require('../../../models/app/events/eventM')
const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
const event_seo_detailsM = require('../../../models/app/events/event_seo_detailsM')
const event_speakersM = require('../../../models/app/events/event_speakersM')
const event_attendeesM = require('../../../models/app/events/event_attendeesM')
const event_faqM = require('../../../models/app/events/event_faqM')
const ticketM = require('../../../models/app/events/ticketM')
const notify_userM = require('../../../models/app/events/notify_userM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const event_watchlistsM = require('../../../models/app/watchlist/eventM')
const events_countM = require('../../../models/app/events/events_countM')
import { deleteAttendees, deleteFAQ, deleteTickets, deleteSponsorsPartners, deleteEventWatchlist } from '../../../utils/helpers/events_helper'
import { getPresentDateTime } from '../../../utils/helpers/helper'
import { deleteNotifications } from '../../../utils/helpers/notification_helper'
import { invalidateEventDeleteCaches } from './events.cache'

/**
 * Ports deleteEvent (utils/helpers/events_helper.js:1613) inline rather than reusing the shared
 * helper as-is, since that helper is still required by controllers/app/events/events_listed.js's
 * own /delete_event route (not in this module's scope) — kept untouched there per the
 * model/helper re-export rule, ported forward here with the Promise.all fix instead.
 */
async function deleteEventCascade(eventRowId: number, deletedReason: string) {
  const query = await eventM_legacy.findOne({ _id: eventRowId })

  await deleted_eventsM({
    user_row_id: query.user_row_id,
    event_title: query.event_title,
    company_row_id: query.company_row_id,
    event_tags: query.event_tags,
    event_type: query.event_type,
    event_city: query.event_city,
    event_state: query.event_state,
    event_venue: query.event_venue,
    event_url: query.event_url,
    event_link: query.event_link,
    start_date: query.start_date,
    end_date: query.end_date,
    event_description: query.event_description,
    contact_user_name: query.contact_user_name,
    contact_mobile_number: query.contact_mobile_number,
    contact_country_row_id: query.contact_country_row_id,
    contact_email_id: query.contact_email_id,
    active_status: query.active_status,
    approval_status: query.approval_status,
    webinar_meeting_type: query.webinar_meeting_type,
    webinar_meeting_link: query.webinar_meeting_link,
    list_event_type: query.list_event_type,
    created_by_admin_status: query.created_by_admin_status,
    created_by_sub_admin_id: query.created_by_sub_admin_id,
    created_date_n_time: query.created_date_n_time,
    longitude: query.longitude,
    latitude: query.latitude,
    utc_row_id: query.utc_row_id,
    deleted_reason: deletedReason || '',
    deleted_date_n_time: getPresentDateTime(),
  }).save()

  // CONFIRMED PERF FIX: none of these 10 reads/writes depends on another's result (they touch
  // disjoint collections, all keyed by the same event_row_id) — the legacy helper awaited each
  // one in sequence; running all 10 together in one Promise.all cuts this cascade from ~10
  // sequential round-trips to 1 batch of concurrent round-trips.
  const [, , , , , checkAttendee, checkFaq, checkTickets, checkSponsorsPartners, checkWatchlist] = await Promise.all([
    eventM_legacy.deleteOne({ _id: eventRowId }),
    event_seo_detailsM.deleteOne({ event_row_id: eventRowId }),
    event_speakersM.deleteMany({ event_row_id: eventRowId }),
    notify_userM.deleteMany({ event_row_id: eventRowId }),
    events_countM.deleteOne({ event_row_id: eventRowId }),
    event_attendeesM.findOne({ event_row_id: eventRowId }),
    event_faqM.findOne({ event_row_id: eventRowId }),
    ticketM.findOne({ event_row_id: eventRowId }),
    event_sponsors_partner_detailsM.findOne({ event_row_id: eventRowId }),
    event_watchlistsM.findOne({ event_row_id: eventRowId }),
  ])

  // The four conditional cleanup helpers are also independent of each other.
  await Promise.all([
    checkAttendee ? deleteAttendees({ type: 2, event_row_id: eventRowId, attendee_row_id: undefined }) : null,
    checkFaq ? deleteFAQ({ type: 2, event_row_id: eventRowId, faq_row_id: undefined }) : null,
    checkTickets ? deleteTickets({ type: 2, event_row_id: eventRowId, ticket_row_id: undefined }) : null,
    checkSponsorsPartners ? deleteSponsorsPartners({ type: 2, event_row_id: eventRowId, sp_row_id: undefined, account_type: undefined, registered_type: undefined, user_company_row_id: undefined }) : null,
    checkWatchlist ? deleteEventWatchlist({ type: 2, event_row_id: eventRowId, watchlist_row_id: undefined }) : null,
    deleteNotifications({ notify_type: 3, notify_type_row_id: eventRowId }),
  ])
}

export async function deleteEvent(requestRowId: number, deletedReason: string) {
  const query = await eventM_legacy.findOne({ _id: requestRowId })
  if (!query) {
    return { status: false, message: { alert_message: 'Invalid Request Row Id' } }
  }

  await deleteEventCascade(requestRowId, deletedReason)
  await invalidateEventDeleteCaches()

  return { status: true, message: { alert_message: 'Event Deleted Successfully' } }
}
