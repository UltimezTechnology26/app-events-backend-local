// modules/events/events.lifecycle-apply.ts
// Publish-time writer for SECTION_EVENT_STATUS (see change-request.registry.ts's own doc
// comment). Reproduces the former enableEvent/disableEvent (events.write.service.ts) and
// approveEvent/rejectEvent (events.approve-reject.service.ts)'s real side effects at publish
// time instead of at submit time - submitting only stages the intent
// (events.lifecycle-request.service.ts). Mirrors company_admin.lifecycle-apply.ts field-for-field.
//
// Every model require is LAZY (inside the functions, not at module top level) - this file is
// statically imported by change-request.apply.ts, same reasoning as company_admin.lifecycle-
// apply.ts's own doc comment (avoids an eager Mongoose model require blowing up change-request.
// apply.test.ts's mongoose mock).
import mongoose from 'mongoose'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import { ChangeRequestDoc } from '../../modules/change-request/change-request.types'
import logger from '../../../config/logger'

const INTENDED_ENABLE = 'enable'
const INTENDED_DISABLE = 'disable'
const INTENDED_APPROVE = 'approve'
const INTENDED_REJECT = 'reject'
const INTENDED_DELETE = 'delete'

interface HostContactInfo {
  event_title: string
  event_url?: string
  user_row_id?: number
  full_name?: string
  email_id?: string
  company_name?: string
  company_email_id?: string
  sub_admin_full_name?: string
  sub_admin_email_id?: string
}

function trackerFrom(actor: ActorRef) {
  return { updated_by: actor.type, updated_by_row_id: actor.id }
}

/**
 * Ports deleteEventCascade (formerly events.write.service.ts, now removed - that file existed
 * solely for the old direct deleteEvent, superseded by submitDeleteEventRequest/this Delete case).
 * Runs post-transaction, same as Company's deleteCompanyDetails call in
 * company_admin.lifecycle-apply.ts's own INTENDED_DELETE case - none of these deletes are
 * session-aware.
 */
async function deleteEventCascade(eventRowId: number, deletedReason: string) {
  const eventM_legacy = require('../../../models/app/events/eventM')
  const deleted_eventsM = require('../../../models/app/events/deleted_eventsM')
  const event_seo_detailsM = require('../../../models/app/events/event_seo_detailsM')
  const event_speakersM = require('../../../models/app/events/event_speakersM')
  const event_attendeesM = require('../../../models/app/events/event_attendeesM')
  const { findOneFaqByRoot } = require('../../common/app-faq/app-faq.repository')
  const ticketM = require('../../../models/app/events/ticketM')
  const notify_userM = require('../../../models/app/events/notify_userM')
  const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
  const event_watchlistsM = require('../../../models/app/watchlist/eventM')
  const events_countM = require('../../../models/app/events/events_countM')
  const { deleteAttendees, deleteFAQ, deleteTickets, deleteSponsorsPartners, deleteEventWatchlist } = require('../../../utils/helpers/events_helper')
  const { getPresentDateTime } = require('../../../utils/helpers/helper')
  const { deleteNotifications } = require('../../../utils/helpers/notification_helper')

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

  // None of these 10 reads/writes depends on another's result (disjoint collections, all keyed by
  // the same event_row_id) - batched in one Promise.all (CLAUDE.md: no DB calls inside loops),
  // same perf fix events.write.service.ts's own deleteEventCascade already had.
  const [, , , , , checkAttendee, checkFaq, checkTickets, checkSponsorsPartners, checkWatchlist] = await Promise.all([
    eventM_legacy.deleteOne({ _id: eventRowId }),
    event_seo_detailsM.deleteOne({ event_row_id: eventRowId }),
    event_speakersM.deleteMany({ event_row_id: eventRowId }),
    notify_userM.deleteMany({ event_row_id: eventRowId }),
    events_countM.deleteOne({ event_row_id: eventRowId }),
    event_attendeesM.findOne({ event_row_id: eventRowId }),
    findOneFaqByRoot({ module: 'event', rootDocumentId: eventRowId }),
    ticketM.findOne({ event_row_id: eventRowId }),
    event_sponsors_partner_detailsM.findOne({ event_row_id: eventRowId }),
    event_watchlistsM.findOne({ event_row_id: eventRowId }),
  ])

  await Promise.all([
    checkAttendee ? deleteAttendees({ type: 2, event_row_id: eventRowId, attendee_row_id: undefined }) : null,
    checkFaq ? deleteFAQ({ type: 2, event_row_id: eventRowId, faq_row_id: undefined }) : null,
    checkTickets ? deleteTickets({ type: 2, event_row_id: eventRowId, ticket_row_id: undefined }) : null,
    checkSponsorsPartners ? deleteSponsorsPartners({ type: 2, event_row_id: eventRowId, sp_row_id: undefined, account_type: undefined, registered_type: undefined, user_company_row_id: undefined }) : null,
    checkWatchlist ? deleteEventWatchlist({ type: 2, event_row_id: eventRowId, watchlist_row_id: undefined }) : null,
    deleteNotifications({ notify_type: 3, notify_type_row_id: eventRowId }),
  ])
}

/** Priority order matches events.approve-reject.service.ts's own sendHostEmail exactly: host email, then company email, then sub-admin email. */
async function sendHostEmail(info: HostContactInfo, subject: string, buildMessage: (name: string) => string) {
  const { sendEmail } = require('../../../config/email')
  if (info.email_id) return sendEmail(info.email_id, subject, buildMessage(info.full_name ?? ''))
  if (info.company_email_id) return sendEmail(info.company_email_id, subject, buildMessage(info.company_name ?? ''))
  if (info.sub_admin_email_id) return sendEmail(info.sub_admin_email_id, subject, buildMessage(info.sub_admin_full_name ?? ''))
  return undefined
}

/** Same aggregate pipeline events.approve-reject.service.ts's own approveEvent/rejectEvent used to
 * resolve host/company/sub-admin contact info - runs post-transaction (no session), same as
 * applyCompanyStatusSideEffects's own plain `companyM.findOne` re-read. */
async function findHostContactInfo(eventM: any, eventRowId: number): Promise<HostContactInfo | undefined> {
  const rows: HostContactInfo[] = await eventM.aggregate([
    { $match: { _id: eventRowId } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1, email_id: 1 } }], as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', pipeline: [{ $project: { company_name: 1, company_email_id: 1 } }], as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'created_by_sub_admin_id', foreignField: '_id', pipeline: [{ $project: { full_name: 1, email_id: 1 } }], as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        event_title: 1,
        event_url: 1,
        user_row_id: 1,
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        company_name: '$company_info.company_name',
        company_email_id: '$company_info.company_email_id',
        sub_admin_full_name: '$sub_admin_info.full_name',
        sub_admin_email_id: '$sub_admin_info.email_id',
      },
    },
  ])
  return rows[0]
}

/** Runs inside the publish transaction - the field flip (+ Approve's one-time event_url generation). */
export async function applyEventStatusWrite({ request, session: rawSession }: { request: ChangeRequestDoc; session: unknown }): Promise<{ appliedFieldCount: number }> {
  const eventM = require('../../../models/app/events/eventM')
  const { generateEventUrl, getPresentDateTime } = require('../../../utils/helpers/helper')
  const session = rawSession as mongoose.ClientSession

  const eventRowId = request.root_document_id
  const intendedAction = (request.payload ?? {})['intended_action'] as string

  if (intendedAction === INTENDED_ENABLE) {
    await eventM.updateOne({ _id: eventRowId }, { $set: { active_status: 1 } }, { session })
    return { appliedFieldCount: 1 }
  }

  if (intendedAction === INTENDED_DISABLE) {
    const disableReason = String((request.payload ?? {})['reason'] ?? '')
    await eventM.updateOne({ _id: eventRowId }, { $set: { active_status: 0, disable_reason: disableReason, disabled_date_n_time: getPresentDateTime() } }, { session })
    return { appliedFieldCount: 1 }
  }

  if (intendedAction === INTENDED_APPROVE) {
    const event = await eventM.findOne({ _id: eventRowId }, { event_title: 1 }, { session })
    const eventUrl = await generateEventUrl(event?.event_title, eventRowId)
    await eventM.updateOne({ _id: eventRowId }, { $set: { approval_status: 1, event_url: eventUrl } }, { session })
    return { appliedFieldCount: 1 }
  }

  if (intendedAction === INTENDED_REJECT) {
    const reasonForReject = String((request.payload ?? {})['reason'] ?? '')
    await eventM.updateOne({ _id: eventRowId }, { $set: { approval_status: 2, reason_for_reject: reasonForReject, rejected_date_n_time: getPresentDateTime() } }, { session })
    return { appliedFieldCount: 1 }
  }

  // Delete: the cascade-delete isn't session-aware, so nothing runs inside the transaction here -
  // see applyEventStatusSideEffects (mirrors company_admin.lifecycle-apply.ts's own Delete case).
  if (intendedAction === INTENDED_DELETE) {
    return { appliedFieldCount: 1 }
  }

  return { appliedFieldCount: 0 }
}

/** Best-effort, post-transaction - the audit-log write, owner notification, and host email (never rolled back if this fails, same convention as applyCompanyStatusSideEffects). */
export async function applyEventStatusSideEffects({ request, actor }: { request: ChangeRequestDoc; actor: ActorRef }): Promise<void> {
  const eventM = require('../../../models/app/events/eventM')
  const { updateNotification } = require('../../../utils/helpers/notification_helper')
  const { recordEventStatusChange } = require('./events.audit')

  const eventRowId = request.root_document_id
  const intendedAction = (request.payload ?? {})['intended_action'] as string
  const tracker = trackerFrom(actor)

  try {
    const info: HostContactInfo | undefined = await findHostContactInfo(eventM, eventRowId)
    if (!info) return

    if (intendedAction === INTENDED_ENABLE) {
      await recordEventStatusChange({ documentId: eventRowId, action: 'enable', tracker, adminRowId: actor.id })
      if (info.user_row_id) {
        await updateNotification({ user_row_id: info.user_row_id, notify_type: 3, notify_type_row_id: eventRowId, message_row_id: 63, action_row_id: eventRowId, event_row_id: eventRowId, notify_image: undefined, notify_name: undefined, notify_id: undefined })
      }
      await sendHostEmail(
        info,
        'Activation Confirmation: ' + info.event_title + ' for Your Event is Now Active!',
        (name) => `
        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${name},</p>
        <p style="color:#000;font-weight: 400;font-size:17px;">We are pleased to inform you that the <b>${info.event_title}</b> for your event has been unlocked, and all its features are now active. You can now resume using your account and take full advantage of the networking opportunities available to you.</p>
        <p style="color:#000;font-weight: 400;font-size:17px;">To make the most of this dynamic event, we invite you to login to your Coinpedia account and proceed with submitting your request. Our team is eagerly awaiting your participation and looks forward to facilitating connections and collaborations among like-minded professionals.</p>
        <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login" style="color:#0029ff;">Login</a> to your Coinpedia account.</p>
        `,
      )
      return
    }

    if (intendedAction === INTENDED_DISABLE) {
      const disableReason = String((request.payload ?? {})['reason'] ?? '')
      await recordEventStatusChange({ documentId: eventRowId, action: 'disable', tracker, adminRowId: actor.id, reason: disableReason })
      if (info.user_row_id) {
        await updateNotification({ user_row_id: info.user_row_id, notify_type: 3, notify_type_row_id: eventRowId, message_row_id: 61, action_row_id: eventRowId, event_row_id: eventRowId, notify_image: undefined, notify_name: undefined, notify_id: undefined })
      }
      await sendHostEmail(
        info,
        ' Heads Up! ' + info.event_title + ' Event Disabled, Needs Changes !',
        (name) => `
        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${name},</p>
        <p style="color:#000;font-weight: 400;font-size:17px;">Sorry to say this, your event <b>${info.event_title}</b> listing request has been denied  by our team.</p>
        <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reason:</b> ${disableReason}</p>
        <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login" style="color:#0029ff;">Login</a> to your Coinpedia account to submit the request again.</p>
        `,
      )
      return
    }

    if (intendedAction === INTENDED_APPROVE) {
      await recordEventStatusChange({ documentId: eventRowId, action: 'approve', tracker, adminRowId: actor.id })
      if (info.user_row_id) {
        await updateNotification({ user_row_id: info.user_row_id, notify_type: 3, notify_type_row_id: eventRowId, message_row_id: 52, action_row_id: eventRowId, event_row_id: eventRowId, notify_image: undefined, notify_name: undefined, notify_id: undefined })
      }
      // event_url was just generated at write time - re-read so the email links to the real live URL.
      const published = await eventM.findOne({ _id: eventRowId }, { event_url: 1 })
      await sendHostEmail(
        { ...info, event_url: published?.event_url },
        `Congratulations! Your Event ${info.event_title} Has Been Approved! 🎉`,
        (name) => `
        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${name},</p>
        <p style="color:#000;font-weight: 400;font-size:17px;">Exciting news! We're thrilled to inform you that your event, <b>${info.event_title}</b>, has been approved by our administrative team.</p>
        <p style="color:#000;font-weight: 400;font-size:17px;">Now you can also manage the event details, tickets, speakers and invite attendees from your  <a href="https://app.coinpedia.org/login/" style="color:#0029ff">Coinpedia account. </a></p>
        <p style="color:#000;font-weight: 400;font-size:17px;">To view and share your approved event with your friends and colleagues, simply click on the following link:</p>
        <a href="https://events.coinpedia.org/${published?.event_url}" target="_blank" rel="nofollow" style="color:#0029ff">See event details</a>
        `,
      )
      return
    }

    if (intendedAction === INTENDED_REJECT) {
      const reasonForReject = String((request.payload ?? {})['reason'] ?? '')
      await recordEventStatusChange({ documentId: eventRowId, action: 'reject', tracker, adminRowId: actor.id, reason: reasonForReject })
      if (info.user_row_id) {
        await updateNotification({ user_row_id: info.user_row_id, notify_type: 3, notify_type_row_id: eventRowId, message_row_id: 53, action_row_id: eventRowId, event_row_id: eventRowId, notify_image: undefined, notify_name: undefined, notify_id: undefined })
      }
      await sendHostEmail(
        info,
        'Important Update on Your Event Listing Submission',
        (name) => `
        <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${name},</p>
        <p style="color:#000;font-weight: 400;font-size:17px;">We wanted to provide you with an update regarding your event listing submission for <b>${info.event_title}</b> After careful consideration, we regret to inform you that your event listing did not meet our current criteria and, unfortunately, could not be approved at this time.</p>
        <p style="color:#000;font-weight: 400;font-size:17px;"><b>Rejected reason : </b>${reasonForReject}</p>
        <p style="color:#000;font-weight: 400;font-size:17px;">We encourage you to revisit the details of your event, making any necessary adjustments to improve its appeal and alignment with our platform's guidelines.</p>
        <p style="color:#000;font-weight: 400;font-size:17px;">You can login to your profile and make the desired changes in your event listing.</p>
        <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff">Login Now </a>to your profile . </p>
        `,
      )
      return
    }

    if (intendedAction === INTENDED_DELETE) {
      const { invalidateEventDeleteCaches } = require('./events.cache')
      const deletedReason = String((request.payload ?? {})['reason'] ?? '')
      // `info` (fetched above) is the only surviving copy of the row once deleteEventCascade has
      // removed it - recorded as the audit snapshot before deleting, same order as
      // company_admin.lifecycle-apply.ts's own INTENDED_DELETE case.
      await recordEventStatusChange({ documentId: eventRowId, action: 'delete', tracker, adminRowId: actor.id, reason: deletedReason, snapshot: info })
      await deleteEventCascade(eventRowId, deletedReason)
      await invalidateEventDeleteCaches()
    }
  } catch (err) {
    logger.error({ err, eventRowId, intendedAction }, 'events.lifecycle-apply: publish side effects failed')
  }
}
