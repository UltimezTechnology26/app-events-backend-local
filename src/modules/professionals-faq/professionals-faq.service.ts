// modules/professionals-faq/professionals-faq.service.ts
// Ports controllers/app/users/faq.js in full (3 routes + a new reorder route) onto the shared
// cln_app_faqs collection (src/common/app-faq) with module: 'professional' - Professionals' own
// leg of the FAQ-unification migration (Events was the pilot, Company the second). Same behavior,
// same response shapes - including the `cache_reponse_status` (missing 's') typo in the list
// route's response key, preserved as-is (this is Professionals' own existing wire contract, not
// something to "fix" during a storage migration).
//
// DB-only schema alignment with markets' own cln_faqs (question/answer/sort_order/status/
// timestamps/actor-tracking) - the HTTP contract is UNCHANGED (faq_question/faq_answer in every
// request/response). Every function below maps wire <-> storage field names at its own boundary.
import type { UpdateFaqBody, UserAuthResult } from './professionals-faq.types'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../modules/change-request/change-request.child.service'
import { SECTION_PROFESSIONAL_FAQ } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { FaqActorRef } from '../../common/app-faq/app-faq.model'
import {
  findFaqByIdAndRoot,
  findFaqByIdLean,
  getNextSortOrder,
  insertFaq,
  updateFaqById,
  aggregateFaqList,
  buildFaqSearchMatch,
  reorderFaqs,
} from '../../common/app-faq/app-faq.repository'
import { extractPaginatedResult } from '../common/common.pagination'

const { deleteUserFAQ, calculateUserProfileScore } = require('../../../utils/helpers/app_helper')
const { getCache, setCache, deleteKeysByPattern } = require('../../../config/cache_helper')
const { getUpdateTrackerFields } = require('@ultimez-interview/coinpedia-backend-library/auth')

const FAQ_MODULE = 'professional' as const
const ADMIN_ROW_ID_MAIN_ADMIN = 0
const USER_TYPE_SELF = 1

function adminActorOf(auth: UserAuthResult) {
  if (!auth.status) return null
  const adminRowId = Number(auth.message.user_row_id)
  return toActorRefWithId(
    { updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin', updated_by_row_id: adminRowId },
    adminRowId,
  )
}

// Row-level created_by/updated_by stamp - independent of (and simpler than) the change-request
// system's own ActorRef/audit trail. Matches events-faq.service.ts/company.faq.service.ts's own
// buildFaqActor exactly.
function buildFaqActor(auth: UserAuthResult): FaqActorRef {
  const trackerFields = getUpdateTrackerFields(auth)
  return { type: trackerFields.updated_by ?? 'user', id: trackerFields.updated_by_row_id ?? 0 }
}

function resolveUserRowId(auth: UserAuthResult, fallbackRaw: unknown): number {
  if (!auth.status) return 0
  if (auth.message.user_type === 1) return auth.message.user_row_id
  const parsed = Number.parseInt(String(fallbackRaw))
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function updateFaqDetails(auth: UserAuthResult, body: UpdateFaqBody, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = { ...preValidationErrors }
  const userRowId = resolveUserRowId(auth, body.user_row_id)

  let faqRowId = 0
  if (body.faq_row_id) {
    const parsedFaqRowId = Number.parseInt(String(body.faq_row_id))
    if (!Number.isNaN(parsedFaqRowId)) {
      const checkValidFaqQuery = await findFaqByIdAndRoot({ module: FAQ_MODULE, faqRowId: parsedFaqRowId, rootDocumentId: userRowId })
      if (checkValidFaqQuery) {
        faqRowId = parsedFaqRowId
      } else {
        errObj['alert_message'] = 'Sorry, Invalid FAQ Row ID.'
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  // Wire -> storage: the HTTP body still carries faq_question/faq_answer (frontend's own
  // contract, unchanged) - mapped to the DB's question/answer fields right here.
  const storageFields = { question: body.faq_question, answer: body.faq_answer }

  // Publish gate applies to admin-panel edits only (design §2) — a professional editing their
  // own FAQ's keeps writing live immediately, exactly as before.
  if (auth.message.user_type !== USER_TYPE_SELF) {
    if (faqRowId) {
      const liveValues = (await findFaqByIdLean({ module: FAQ_MODULE, faqRowId })) ?? {}
      return submitChildChangeRequest({
        module: AUDIT_MODULE_PROFESSIONALS,
        section: SECTION_PROFESSIONAL_FAQ,
        rootDocumentId: userRowId,
        targetRowId: faqRowId,
        liveValues,
        submitted: storageFields,
        actor: adminActorOf(auth)!,
      })
    }

    // A still-pending CREATE needs its own sort_order riding along in `submitted` (an
    // admin-approved creation never goes through insertFaq's own getNextSortOrder call).
    return submitChildChangeRequest({
      module: AUDIT_MODULE_PROFESSIONALS,
      section: SECTION_PROFESSIONAL_FAQ,
      rootDocumentId: userRowId,
      targetRowId: null,
      liveValues: {},
      submitted: { ...storageFields, sort_order: await getNextSortOrder({ module: FAQ_MODULE, rootDocumentId: userRowId }) },
      actor: adminActorOf(auth)!,
    })
  }

  const faqActor = buildFaqActor(auth)

  if (faqRowId) {
    await updateFaqById({ module: FAQ_MODULE, faqRowId, updateObject: storageFields, actor: faqActor })
    await Promise.all([deleteKeysByPattern('user_faq_list_*'), deleteKeysByPattern('app_user_other_details_*')])
    return { status: true, message: { alert_message: 'This FAQ details has been updated successfully.' } }
  }

  await insertFaq({ module: FAQ_MODULE, rootDocumentId: userRowId, question: body.faq_question, answer: body.faq_answer, actor: faqActor })
  await Promise.all([deleteKeysByPattern('user_faq_list_*'), deleteKeysByPattern('app_user_other_details_*')])
  await calculateUserProfileScore(userRowId, ['faq'])
  return { status: true, message: { alert_message: 'New FAQ details has been listed successfully.' } }
}

export async function getFaqList(auth: UserAuthResult, skipRaw: string, limitRaw: string, queryUserRowIdRaw: unknown, searchRaw: unknown) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = {}
  if (Number.isNaN(Number.parseInt(skipRaw))) errObj['skip'] = 'The parameter skip field must be contain valid number'
  if (Number.isNaN(Number.parseInt(limitRaw))) errObj['limit'] = 'The parameter limit field must be contain valid number.'

  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const skip = Number.parseInt(skipRaw)
  const limit = Number.parseInt(limitRaw)

  const key = `user_faq_list_${userRowId}_${searchRaw || ''}_${skip}_${limit}`

  const cacheResponse = await getCache({ key })
  if (cacheResponse.status) {
    return { status: true, message: cacheResponse.message.list, count: cacheResponse.message.count, cache_reponse_status: true }
  }

  const searchMatch = buildFaqSearchMatch({ module: FAQ_MODULE, rootDocumentId: userRowId, search: searchRaw ? String(searchRaw) : undefined })
  const aggregateOutput = await aggregateFaqList({ searchMatch, skip, limit })
  const { data, count } = extractPaginatedResult(aggregateOutput)
  // Storage -> wire: faq_question/faq_answer out, same as the create/update path's own mapping
  // the other direction.
  const wireData = (data as { _id: number; question: string; answer: string }[]).map((row) => ({
    _id: row._id,
    faq_question: row.question,
    faq_answer: row.answer,
  }))

  await setCache({ key, value: { list: wireData, count }, ttl: 1800 })

  return { status: true, message: wireData, count, cache_reponse_status: false }
}

export async function deleteFaq(auth: UserAuthResult, faqRowIdRaw: string, queryUserRowIdRaw: unknown) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = {}
  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)

  let faqRowId = 0
  let rowSnapshot: Record<string, unknown> = {}
  if (Number.isNaN(Number.parseInt(faqRowIdRaw))) {
    errObj['faq_row_id'] = 'The faq row id field must be contain valid number.'
  } else {
    faqRowId = Number.parseInt(faqRowIdRaw)
    const checkQuery = await findFaqByIdAndRoot({ module: FAQ_MODULE, faqRowId, rootDocumentId: userRowId })
    if (!checkQuery) {
      errObj['faq_row_id'] = 'Invalid faq row id.'
    } else {
      rowSnapshot = typeof checkQuery.toObject === 'function' ? checkQuery.toObject() : { ...checkQuery }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  // Publish gate applies to admin-panel edits only (design §2) — a professional deleting their
  // own FAQ keeps writing live immediately, exactly as before.
  if (auth.message.user_type !== USER_TYPE_SELF) {
    return submitChildDeleteRequest({
      module: AUDIT_MODULE_PROFESSIONALS,
      section: SECTION_PROFESSIONAL_FAQ,
      rootDocumentId: userRowId,
      targetRowId: faqRowId,
      rowSnapshot,
      actor: adminActorOf(auth)!,
    })
  }

  await deleteUserFAQ({ type: 1, user_row_id: userRowId, faq_row_id: faqRowId })
  await Promise.all([deleteKeysByPattern('user_faq_list_*'), deleteKeysByPattern('app_user_other_details_*')])
  await calculateUserProfileScore(userRowId, ['faq'])

  return { status: true, message: { alert_message: 'This FAQ details for this user have been deleted successfully.' } }
}

// New - Professionals had no reorder route before this migration (unlike markets, whose
// drag-reorder UI this mirrors). Submits one per-row child change request for an admin actor
// (each diffing only that row's own sort_order, reusing the EXISTING field-diff engine), or
// writes straight through reorderFaqs for the professional's own self, matching every other FAQ
// action's existing live-vs-staged split. Mirrors events-faq.service.ts/company.faq.service.ts's
// own reorderFaqDetails exactly.
export async function reorderFaqDetails(auth: UserAuthResult, queryUserRowIdRaw: unknown, orderedIdsRaw: unknown) {
  if (!auth.status) return auth

  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)
  const orderedIds = Array.isArray(orderedIdsRaw)
    ? orderedIdsRaw.map((id) => Number.parseInt(String(id))).filter((id) => !Number.isNaN(id))
    : []
  if (!orderedIds.length) {
    return { status: false, message: { ordered_ids: 'Sorry, nothing to reorder.' } }
  }

  if (auth.message.user_type !== USER_TYPE_SELF) {
    const actor = adminActorOf(auth)!
    await Promise.all(
      orderedIds.map(async (faqId, index) => {
        const liveValues = (await findFaqByIdLean({ module: FAQ_MODULE, faqRowId: faqId })) ?? {}
        return submitChildChangeRequest({
          module: AUDIT_MODULE_PROFESSIONALS,
          section: SECTION_PROFESSIONAL_FAQ,
          rootDocumentId: userRowId,
          targetRowId: faqId,
          liveValues,
          submitted: { sort_order: index },
          actor,
        })
      }),
    )
    return { status: true, message: { alert_message: 'Submitted for approval - this order will apply once a full admin approves and publishes the change.' } }
  }

  await reorderFaqs({ module: FAQ_MODULE, rootDocumentId: userRowId, orderedIds, actor: buildFaqActor(auth) })
  await Promise.all([deleteKeysByPattern('user_faq_list_*'), deleteKeysByPattern('app_user_other_details_*')])

  return { status: true, message: { alert_message: 'FAQ order has been updated successfully.' } }
}
