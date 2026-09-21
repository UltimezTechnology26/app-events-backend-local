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
import { ActorRef } from '../../common/status-audit/status-audit.types'
import { ChangeRequestDoc } from '../../modules/change-request/change-request.types'
import logger from '../../../config/logger'

const INTENDED_ENABLE = 'enable'
const INTENDED_DISABLE = 'disable'

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
    }
  } catch (err) {
    logger.error({ err, companyRowId, intendedAction }, 'company_admin.lifecycle-apply: publish side effects failed')
  }
}
