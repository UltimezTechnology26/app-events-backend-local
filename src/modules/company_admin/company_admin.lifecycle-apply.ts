// modules/company_admin/company_admin.lifecycle-apply.ts
// Publish-time writer for SECTION_COMPANY_STATUS (see change-request.registry.ts's own doc
// comment) — mirrors professionals.lifecycle-apply.ts field-for-field. Reproduces
// enableCompany/disableCompany (company_admin.service.ts)'s real side effects at publish time
// instead of at submit time — submitting only stages the intent
// (company_admin.lifecycle-request.service.ts).
//
// Every model require is LAZY (inside the functions, not at module top level) — this file is
// statically imported by change-request.apply.ts, and change-request.apply.test.ts mocks
// `mongoose` itself, so an eager `import`/top-level `require` of a real Mongoose model here would
// blow up test setup exactly the way this file's own sibling (professionals.lifecycle-apply.ts)
// first did before being fixed, and the same way change-request.registry.ts's own doc comment
// already documents for its cache-invalidation requires.
import mongoose from 'mongoose'
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import { ChangeRequestDoc } from '../../modules/change-request/change-request.types'
import logger from '../../../config/logger'

const INTENDED_ENABLE = 'enable'
const INTENDED_DISABLE = 'disable'
const INTENDED_APPROVE = 'approve'
const INTENDED_REJECT = 'reject'

function trackerFrom(actor: ActorRef) {
  return { updated_by: actor.type, updated_by_row_id: actor.id }
}

/** Runs inside the publish transaction — the field flip + its cascading events/podcast writes. */
export async function applyCompanyStatusWrite({ request, session: rawSession }: { request: ChangeRequestDoc; session: unknown }): Promise<{ appliedFieldCount: number }> {
  const companyM = require('../../../models/app/company/companyM')
  const eventM = require('../../../models/app/events/eventM')
  const companyPodcastsM = require('../../../models/app/podcast/companyPodcastsM')
  const session = rawSession as mongoose.ClientSession

  const companyRowId = request.root_document_id
  const intendedAction = (request.payload ?? {})['intended_action'] as string

  if (intendedAction === INTENDED_ENABLE) {
    const [, checkPodcast] = await Promise.all([
      companyM.updateOne({ _id: companyRowId }, { $set: { active_status: 1 } }, { session }),
      companyPodcastsM.findOne({ company_row_id: companyRowId }, null, { session }),
    ])
    if (checkPodcast) await companyPodcastsM.deleteOne({ company_row_id: companyRowId }, { session })
    return { appliedFieldCount: 1 }
  }

  if (intendedAction === INTENDED_DISABLE) {
    const disableReason = String((request.payload ?? {})['disable_reason'] ?? '')
    const [, checkEvents] = await Promise.all([
      companyM.updateOne(
        { _id: companyRowId },
        { $set: { disable_reason: disableReason, disabled_date_n_time: new Date(), active_status: 0 } },
        { session },
      ),
      eventM.findOne({ company_row_id: companyRowId }, null, { session }),
    ])
    if (checkEvents) await eventM.updateMany({ company_row_id: companyRowId }, { $set: { active_status: 0 } }, { session })
    return { appliedFieldCount: 1 }
  }

  if (intendedAction === INTENDED_APPROVE) {
    await companyM.updateOne({ _id: companyRowId }, { $set: { approval_status: 1 } }, { session })
    return { appliedFieldCount: 1 }
  }

  if (intendedAction === INTENDED_REJECT) {
    const { getPresentDateTime } = require('../../../utils/helpers/helper')
    const reasonRejected = String((request.payload ?? {})['disable_reason'] ?? '')
    // Mirrors rejectCompanyRequest's own admin_row_id computation (company_admin.approvals.
    // service.ts, now removed): approval_sub_admin_row_id is only ever the acting sub-admin's
    // id, 0 for a full admin. The "acting" admin here is whoever SUBMITTED the reject
    // (request.requested_by), not whoever publishes it later - same actor the original
    // synchronous handler read from its own `admin` param at the moment of reject.
    const approvalSubAdminRowId = request.requested_by.type === 'subadmin' ? Number(request.requested_by.id ?? 0) : 0
    await companyM.updateOne(
      { _id: companyRowId },
      {
        $set: {
          approval_status: 2,
          approval_sub_admin_row_id: approvalSubAdminRowId,
          reason_rejected: reasonRejected,
          rejected_date_n_time: getPresentDateTime(),
        },
      },
      { session },
    )
    return { appliedFieldCount: 1 }
  }

  return { appliedFieldCount: 0 }
}

/** Best-effort, post-transaction — the audit-log write and owner notification (never rolled back if this fails, same convention as applyBasicDetailsSideEffects). */
export async function applyCompanyStatusSideEffects({ request, actor }: { request: ChangeRequestDoc; actor: ActorRef }): Promise<void> {
  const companyM = require('../../../models/app/company/companyM')
  const { recordCompanyStatusChange } = require('./company_admin.audit')
  const { updateNotification } = require('../../../utils/helpers/notification_helper')

  const companyRowId = request.root_document_id
  const intendedAction = (request.payload ?? {})['intended_action'] as string
  const tracker = trackerFrom(actor)

  try {
    const company = await companyM.findOne({ _id: companyRowId })
    if (!company) return

    if (intendedAction === INTENDED_ENABLE) {
      await recordCompanyStatusChange({ documentId: companyRowId, action: 'enable', tracker, adminRowId: actor.id })
      if (company.user_row_id) {
        await updateNotification({ user_row_id: company.user_row_id, notify_type: 2, notify_type_row_id: companyRowId, message_row_id: 15, action_row_id: companyRowId })
      }
      return
    }

    if (intendedAction === INTENDED_DISABLE) {
      const disableReason = String((request.payload ?? {})['disable_reason'] ?? '')
      await recordCompanyStatusChange({ documentId: companyRowId, action: 'disable', tracker, adminRowId: actor.id, reason: disableReason })
      if (company.user_row_id) {
        await updateNotification({ user_row_id: company.user_row_id, notify_type: 2, notify_type_row_id: companyRowId, message_row_id: 16, action_row_id: companyRowId })
      }
      return
    }

    if (intendedAction === INTENDED_APPROVE) {
      const { sendEmail } = require('../../../config/email')
      await recordCompanyStatusChange({ documentId: companyRowId, action: 'approve', tracker, adminRowId: actor.id })
      await deleteKeysByPattern('app_company_individual_details_*')
      await deleteKeysByPattern('app_company_list_*')

      if (company.user_row_id) {
        await updateNotification({ user_row_id: company.user_row_id, notify_type: 2, notify_type_row_id: companyRowId, message_row_id: 10, action_row_id: companyRowId })
      }

      const companyName = company.company_name
      const passSubject = 'Your company ' + companyName + ' was Approved by the Admin. '
      const passMessage = `
    <p style="text-transform: capitalize;color:#000;font-weight: 500;font-size:22px;">Hello ${companyName},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Your Company <b style="text-transform: capitalize;">${companyName}</b> is reviewed and approved successfully by the admin. </p>
    <p style="color:#000;font-weight: 400;font-size:17px;"> You can now list and manage your events, update company details, add tokens, and access all the exciting features on Coinpedia.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login Now</a> </p>
    `
      await sendEmail(company.company_email_id, passSubject, passMessage)
      return
    }

    if (intendedAction === INTENDED_REJECT) {
      const { sendEmail } = require('../../../config/email')
      const reasonRejected = String((request.payload ?? {})['disable_reason'] ?? '')
      await recordCompanyStatusChange({ documentId: companyRowId, action: 'reject', tracker, adminRowId: actor.id, reason: reasonRejected })
      await deleteKeysByPattern('app_company_individual_details_*')
      await deleteKeysByPattern('app_company_list_*')

      if (company.user_row_id) {
        await updateNotification({ user_row_id: company.user_row_id, notify_type: 2, notify_type_row_id: companyRowId, message_row_id: 11, action_row_id: companyRowId })
      }

      const companyName = company.company_name
      const passSubject = 'CoinPedia Company Profile Request Denied'
      const passMessage = `
    <p style="text-transform: capitalize;color:#000;font-weight: 500;font-size:22px;">Dear  ${companyName},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We regret to inform you that your CoinPedia Company Profile account application has been denied.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;"><b>Reject Reason : </b>${reasonRejected}</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Your interest is appreciated, and we invite you to <a href="https://app.coinpedia.org/login/" style="color: #0029ff;font-weight: 400;">Register<a> to CoinPedia for more information!</p>
    `
      await sendEmail(company.company_email_id, passSubject, passMessage)
    }
  } catch (err) {
    logger.error({ err, companyRowId, intendedAction }, 'company_admin.lifecycle-apply: publish side effects failed')
  }
}
