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
    }
  } catch (err) {
    logger.error({ err, eventRowId, intendedAction }, 'events.lifecycle-apply: publish side effects failed')
  }
}
