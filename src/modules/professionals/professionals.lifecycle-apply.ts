// modules/professionals/professionals.lifecycle-apply.ts
// Publish-time writer for SECTION_PROFESSIONAL_STATUS (see change-request.registry.ts's own doc
// comment). Reproduces enableUser/disableUser (professionals.service.ts) and deleteUser
// (professionals-delete-lifecycle.service.ts)'s real side effects at publish time instead of at
// submit time — submitting only stages the intent (professionals.lifecycle-request.service.ts).
//
// The core field flip and its cascading company/podcast/events writes run INSIDE the publish
// transaction (session-scoped, same as every other customWriter) for Enable/Disable. Delete is the
// one exception: `deleteUserDetais` cascades across many collections and isn't session-aware, so
// it runs as a best-effort side effect AFTER the transaction commits — same "failure here doesn't
// roll back the already-committed request status" convention already used for
// applyProfessionalBasicDetailsSideEffects/insertChangeLog elsewhere in change-request.apply.ts.
import mongoose from 'mongoose'
import { ActorRef } from '../../common/status-audit/status-audit.types'
import { ChangeRequestDoc } from '../../modules/change-request/change-request.types'
import { recordProfessionalStatusChange } from './professionals.audit'
import { ProfessionalM, ProfessionalDisabledM } from './professionals.models'
import logger from '../../../config/logger'

const { sendEmail } = require('../../../config/email')
const { deleteUserDetais } = require('../../../utils/helpers/app_helper')
const companyM = require('../../../models/app/company/companyM')
const eventM = require('../../../models/app/events/eventM')
const userPodcastsM = require('../../../models/app/podcast/userPodcastsM')
const companyPodcastsM = require('../../../models/app/podcast/companyPodcastsM')

const INTENDED_ENABLE = 'enable'
const INTENDED_DISABLE = 'disable'
const INTENDED_DELETE = 'delete'

function trackerFrom(actor: ActorRef) {
  return { updated_by: actor.type, updated_by_row_id: actor.id }
}

/** Runs inside the publish transaction — the field flip + its cascading writes for Enable/Disable, a no-op for Delete (see module doc comment). */
export async function applyProfessionalStatusWrite({ request, session: rawSession }: { request: ChangeRequestDoc; session: unknown }): Promise<{ appliedFieldCount: number }> {
  const userRowId = request.root_document_id
  const intendedAction = (request.payload ?? {})['intended_action'] as string
  const session = rawSession as mongoose.ClientSession

  if (intendedAction === INTENDED_ENABLE) {
    const [, checkCompanyStatus, checkEvents] = await Promise.all([
      ProfessionalM.updateOne({ _id: userRowId }, { $set: { login_status: 1, updated_date_n_time: new Date() } }, { session }),
      companyM.findOne({ user_row_id: userRowId, active_status: 1, approval_status: 1 }, null, { session }),
      eventM.findOne({ user_row_id: userRowId }, null, { session }),
    ])
    if (checkEvents) {
      const companyActive = checkCompanyStatus ? 1 : 0
      if (companyActive === 1) {
        await eventM.updateMany({ user_row_id: userRowId }, { $set: { active_status: 1 } }, { session })
      } else {
        await eventM.updateMany({ user_row_id: userRowId, list_event_type: 1 }, { $set: { active_status: 1 } }, { session })
      }
    }
    return { appliedFieldCount: 1 }
  }

  if (intendedAction === INTENDED_DISABLE) {
    const reasonForDisable = String((request.payload ?? {})['reason_for_disable'] ?? '')
    const [, checkPodcast, checkCompany, checkEvents] = await Promise.all([
      ProfessionalM.updateOne({ _id: userRowId }, { $set: { login_status: 0, updated_date_n_time: new Date() } }, { session }),
      userPodcastsM.findOne({ user_row_id: userRowId }, null, { session }),
      companyM.findOne({ user_row_id: userRowId }, null, { session }),
      eventM.findOne({ user_row_id: userRowId }, null, { session }),
    ])

    const followUpWrites: Promise<unknown>[] = [
      new ProfessionalDisabledM({ user_row_id: userRowId, disabled_reason: reasonForDisable, date_n_time: new Date() }).save({ session }),
    ]
    if (checkPodcast) followUpWrites.push(userPodcastsM.deleteOne({ user_row_id: userRowId }, { session }))
    if (checkCompany) {
      followUpWrites.push(companyM.updateOne({ _id: checkCompany._id }, { $set: { active_status: 0 } }, { session }))
      const checkCompanyPodcast = await companyPodcastsM.findOne({ company_row_id: checkCompany._id }, null, { session })
      if (checkCompanyPodcast) followUpWrites.push(companyPodcastsM.deleteOne({ company_row_id: checkCompany._id }, { session }))
    }
    if (checkEvents) followUpWrites.push(eventM.updateMany({ user_row_id: userRowId }, { $set: { active_status: 0 } }, { session }))
    await Promise.all(followUpWrites)
    return { appliedFieldCount: 1 }
  }

  // Delete: nothing to write inside the transaction — see applyProfessionalStatusSideEffects.
  return { appliedFieldCount: 1 }
}

/** Best-effort, post-transaction — email notification (Enable/Disable) and the real cascade-delete (Delete). Mirrors applyProfessionalBasicDetailsSideEffects's own "never throw on a failure here" contract. */
export async function applyProfessionalStatusSideEffects({ request, actor }: { request: ChangeRequestDoc; actor: ActorRef }): Promise<void> {
  const userRowId = request.root_document_id
  const intendedAction = (request.payload ?? {})['intended_action'] as string
  const tracker = trackerFrom(actor)

  try {
    const professional = await ProfessionalM.findOne({ _id: userRowId })
    if (!professional) return

    if (intendedAction === INTENDED_ENABLE) {
      await recordProfessionalStatusChange({ documentId: userRowId, action: 'enable', tracker, adminRowId: actor.id })
      await sendEmail(
        professional.email_id,
        'CoinPedia Account Resumed',
        `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hi ${professional.full_name},</p>
         <div style="color:#000;">
             <p style="color:#000;font-weight: 400;font-size:17px;">Congratulations ! </p>
             <p style="color:#000;font-weight: 400;font-size:17px;">Your Coinpedia account has been Unblocked and all the features are now active. You can now continue using your account. </p>
         </div>`,
      )
      return
    }

    if (intendedAction === INTENDED_DISABLE) {
      const reasonForDisable = String((request.payload ?? {})['reason_for_disable'] ?? '')
      await recordProfessionalStatusChange({ documentId: userRowId, action: 'disable', tracker, adminRowId: actor.id, reason: reasonForDisable })
      await sendEmail(
        professional.email_id,
        'CoinPedia Account Blocked',
        `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${professional.full_name},</p>
         <div style="color:#000;">
             <p style="color:#000;font-weight: 400;font-size:17px;">This mail is to notify you that your CoinPedia account has been blocked due to ${reasonForDisable}. Please reach out to our Support team for more information and unblock request.</p>
             <p style="color:#000;font-weight: 400;font-size:17px;">DO NOT REPLY TO THIS EMAIL. </p>
         </div>`,
      )
      return
    }

    if (intendedAction === INTENDED_DELETE) {
      await deleteUserDetais({ user_row_id: userRowId, token: null })
    }
  } catch (err) {
    logger.error({ err, userRowId, intendedAction }, 'professionals.lifecycle-apply: publish side effects failed')
  }
}
