// src/modules/events-faq/events-faq.service.ts
//
// Ports controllers/events/faq.js's 3 routes (+ a new reorder route) onto the shared cln_app_faqs
// collection (src/common/app-faq) with module: 'event' - the Events pilot for the FAQ unification
// across Company/Professionals/Events (see src/common/app-faq/app-faq.model.ts's own doc comment).
//
// DB-only schema alignment with markets' own cln_faqs (question/answer/sort_order/status/
// timestamps/actor-tracking) - the HTTP contract is UNCHANGED (faq_question/faq_answer in every
// request/response), per the user's explicit "keep the wire format" direction. Every function
// below maps wire <-> storage field names at its own boundary rather than changing what
// frontend-events-typescript (or any other consumer of an embedded faq[] list) sends/reads.
import sanitize from 'mongo-sanitize'
const eventM = require('../../../models/app/events/eventM')
const { checkSubadminAccess, deleteFAQ } = require('../../../utils/helpers/events_helper')
const { calculateEventScore } = require('../../../utils/helpers/app_helper')
const { getUpdateTrackerFields } = require('@ultimez-interview/coinpedia-backend-library/auth')
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../modules/change-request/change-request.child.service'
import { AUDIT_MODULE_EVENTS } from '../../common/status-audit/status-audit.registry'
import { SECTION_EVENT_FAQ } from '../../modules/change-request/change-request.registry'
import { isAdminPanelActor, buildEventChangeRequestActor } from '../events/events.change-request-actor'
import { extractPaginatedResult } from '../common/common.pagination'
import { FaqActorRef } from '../../common/app-faq/app-faq.model'
import {
  aggregateFaqList,
  buildFaqSearchMatch,
  findFaqByIdAndRoot,
  findFaqById,
  findFaqByIdLean,
  getNextSortOrder,
  insertFaq,
  reorderFaqs,
  updateFaqById,
} from '../../common/app-faq/app-faq.repository'
import { buildFaqListKey, getCache, invalidateFaqCaches, setCache } from './events-faq.cache'
import { CheckUserTokenResult, UpdateEventFaqBody } from './events-faq.types'

const FAQ_MODULE = 'event' as const

// Row-level created_by/updated_by stamp - independent of (and simpler than) the change-request
// system's own ActorRef/audit trail, which already records who requested/approved/published a
// change at the change_request level. Falls back to a 'user'/0 shape rather than nulls so it
// always satisfies FaqActorRef's required {type, id} - matches getUpdateTrackerFields' own
// documented null-safe contract (an unauthenticated/malformed token normalizes to
// {updated_by: null, updated_by_row_id: null}).
function buildFaqActor(checkUserToken: CheckUserTokenResult): FaqActorRef {
  const trackerFields = getUpdateTrackerFields(checkUserToken)
  return { type: trackerFields.updated_by ?? 'user', id: trackerFields.updated_by_row_id ?? 0 }
}

export async function updateFaqDetails(checkUserToken: CheckUserTokenResult, body: UpdateEventFaqBody, preValidationErrors: Record<string, unknown>) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const errObj: Record<string, unknown> = { ...preValidationErrors }
  let event_row_id = 0

  if (!Number.isNaN(Number.parseFloat(String(body.event_row_id)))) {
    event_row_id = Number.parseInt(String(body.event_row_id))

    const check_event_query = await eventM.findOne({ _id: event_row_id }, { _id: 1 })
    if (!check_event_query) {
      errObj['event_row_id'] = 'Invalid event row id is supplied.'
    }

    const token_message = checkUserToken.token_message
    if (token_message?.admin_row_id) {
      const check_access = await checkSubadminAccess({
        admin_row_id: Number.parseInt(String(token_message.admin_row_id)),
        admin_manager_type: token_message.admin_manager_type,
        sub_admin_type: Number.parseInt(String(token_message.sub_admin_type)),
        event_row_id,
      })
      if (!check_access.status) {
        errObj['alert_message'] = check_access.message
      }
    }

    if (Number(checkUserToken.message.user_type) === 1) {
      const host_user_row_id = checkUserToken.message.user_row_id
      const check_event_res = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id })
      if (!check_event_res) {
        errObj['event_row_id'] = 'Invalid Event Row ID.'
      }
    }
  }

  let faq_row_id = 0
  if (body.faq_row_id) {
    const parsedFaqRowId = Number.parseInt(String(body.faq_row_id))
    if (!Number.isNaN(parsedFaqRowId)) {
      const check_valid_faq_query = await findFaqByIdAndRoot({ module: FAQ_MODULE, faqRowId: parsedFaqRowId, rootDocumentId: event_row_id })
      if (check_valid_faq_query) {
        faq_row_id = parsedFaqRowId
      } else {
        errObj['alert_message'] = 'Sorry, Invalid FAQ Row ID.'
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  // Wire -> storage: the HTTP body still carries faq_question/faq_answer (frontend's own
  // contract, unchanged) - mapped to the DB's question/answer fields right here, the one
  // boundary where that translation happens for writes.
  const storage_update_object: Record<string, unknown> = {
    question: body.faq_question,
    answer: body.faq_answer,
  }
  const actor = buildFaqActor(checkUserToken)

  // Publish gate applies to admin-panel edits only (design §2) - the event's own host keeps
  // writing live immediately via the branches below, unchanged (2026-09-25 user decision).
  if (isAdminPanelActor(checkUserToken)) {
    const liveValues = faq_row_id ? ((await findFaqByIdLean({ module: FAQ_MODULE, faqRowId: faq_row_id })) ?? {}) : {}
    // A still-pending CREATE needs its own sort_order riding along in `submitted` (an
    // admin-approved creation never goes through insertFaq's own getNextSortOrder call) -
    // computed now, not left to the schema's sort_order:0 default, which every admin-approved
    // creation would otherwise collide on. EVENT_FAQ_EDITABLE_FIELDS includes sort_order for
    // exactly this (change-request.registry.ts).
    const submitted = faq_row_id ? storage_update_object : { ...storage_update_object, sort_order: await getNextSortOrder({ module: FAQ_MODULE, rootDocumentId: event_row_id }) }
    return submitChildChangeRequest({
      module: AUDIT_MODULE_EVENTS,
      section: SECTION_EVENT_FAQ,
      rootDocumentId: event_row_id,
      targetRowId: faq_row_id ? Number(faq_row_id) : null,
      liveValues,
      submitted,
      actor: buildEventChangeRequestActor(checkUserToken),
    })
  }

  if (faq_row_id) {
    await updateFaqById({ module: FAQ_MODULE, faqRowId: faq_row_id, updateObject: storage_update_object, actor })
    await invalidateFaqCaches()
    return { status: true, message: { alert_message: 'This FAQ details has been updated successfully.' } }
  }

  await insertFaq({ module: FAQ_MODULE, rootDocumentId: event_row_id, question: body.faq_question, answer: body.faq_answer, actor })
  await invalidateFaqCaches()
  await calculateEventScore(event_row_id, ['faq'])

  return { status: true, message: { alert_message: 'New FAQ details has been listed successfully.' } }
}

export async function getFaqList(
  checkUserToken: CheckUserTokenResult,
  eventRowIdRaw: string,
  skipRaw: string,
  limitRaw: string,
  searchRaw: unknown,
  rawQuery: Record<string, unknown>,
) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const errObj: Record<string, unknown> = {}
  if (Number.isNaN(Number.parseInt(skipRaw))) {
    errObj['skip'] = 'The parameter skip field must be contain valid number'
  }
  if (Number.isNaN(Number.parseInt(limitRaw))) {
    errObj['limit'] = 'The parameter limit field must be contain valid number.'
  }

  let event_row_id = 0
  if (!Number.isNaN(Number.parseInt(eventRowIdRaw))) {
    event_row_id = Number.parseInt(eventRowIdRaw)
  } else {
    errObj['event_row_id'] = 'The event row id field must be contain valid number.'
  }

  const host_user_row_id = Number(checkUserToken.message.user_type) === 1 ? checkUserToken.message.user_row_id : 0
  if (event_row_id && host_user_row_id) {
    const check_event_res = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id })
    if (!check_event_res) {
      errObj['event_row_id'] = 'Invalid Event Row ID.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const skip = Number.parseInt(skipRaw)
  const limit = Number.parseInt(limitRaw)
  const search = searchRaw ? sanitize(String(searchRaw)) : undefined

  const key = buildFaqListKey({ eventRowId: event_row_id, skip, limit, query: rawQuery })

  const cache_response = await getCache({ key })
  if (cache_response.status) {
    return { status: true, message: cache_response.message.list, count: cache_response.message.count, cache_response_status: true }
  }

  const searchMatch = buildFaqSearchMatch({ module: FAQ_MODULE, rootDocumentId: event_row_id, search })
  const aggregateOutput = await aggregateFaqList({ searchMatch, skip, limit })
  const { data, count } = extractPaginatedResult(aggregateOutput)
  // Storage -> wire: faq_question/faq_answer out, same as the create/update path's own mapping
  // the other direction. sort_order/status stay internal - no existing consumer reads them.
  const wireData = (data as { _id: number; question: string; answer: string }[]).map((row) => ({
    _id: row._id,
    faq_question: row.question,
    faq_answer: row.answer,
  }))

  await setCache({ key, value: { list: wireData, count }, ttl: 1800 })

  return { status: true, message: wireData, count, cache_response_status: false }
}

export async function deleteFaq(checkUserToken: CheckUserTokenResult, faqRowIdRaw: string) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const errObj: Record<string, unknown> = {}
  const host_user_row_id = Number(checkUserToken.message.user_type) === 1 ? checkUserToken.message.user_row_id : 0

  let faq_row_id = 0
  let event_row_id = 0

  if (Number.isNaN(Number.parseInt(faqRowIdRaw))) {
    errObj['faq_row_id'] = 'The faq row id field must be contain valid number.'
  } else {
    faq_row_id = Number.parseInt(faqRowIdRaw)
    const check_query = await findFaqById({ module: FAQ_MODULE, faqRowId: faq_row_id })
    if (!check_query) {
      errObj['faq_row_id'] = 'Invalid faq row id.'
    } else {
      event_row_id = check_query.root_document_id ?? 0
      const token_message = checkUserToken.token_message
      if (token_message?.admin_row_id) {
        const check_access = await checkSubadminAccess({
          admin_row_id: Number.parseInt(String(token_message.admin_row_id)),
          admin_manager_type: token_message.admin_manager_type,
          sub_admin_type: Number.parseInt(String(token_message.sub_admin_type)),
          event_row_id,
        })
        if (!check_access.status) {
          errObj['alert_message'] = check_access.message
        }
      }

      if (event_row_id && host_user_row_id) {
        const check_event_res = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id })
        if (!check_event_res) {
          errObj['event_row_id'] = 'Invalid Event Row ID.'
        }
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  // Publish gate applies to admin-panel edits only (design §2), matching the create/update path
  // above - the event's own host keeps deleting live immediately via the branch below, unchanged.
  if (isAdminPanelActor(checkUserToken)) {
    const rowSnapshot = (await findFaqByIdLean({ module: FAQ_MODULE, faqRowId: faq_row_id })) ?? {}
    return submitChildDeleteRequest({
      module: AUDIT_MODULE_EVENTS,
      section: SECTION_EVENT_FAQ,
      rootDocumentId: event_row_id,
      targetRowId: faq_row_id,
      rowSnapshot,
      actor: buildEventChangeRequestActor(checkUserToken),
    })
  }

  await deleteFAQ({ type: 1, event_row_id, faq_row_id })
  await invalidateFaqCaches()
  await calculateEventScore(event_row_id, ['faq'])

  return { status: true, message: { alert_message: 'This FAQ details for this event have been deleted successfully.' } }
}

// New - Events' own FAQ had no reorder route before this migration (unlike markets, whose
// drag-reorder UI this mirrors). Submits one per-row child change request for an admin actor
// (each diffing only that row's own sort_order, reusing the EXISTING field-diff engine - no new
// change-request mechanism needed), or writes straight through reorderFaqs for the event's own
// host, matching every other FAQ action's existing live-vs-staged split.
export async function reorderFaqDetails(checkUserToken: CheckUserTokenResult, eventRowIdRaw: string, orderedIdsRaw: unknown) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const errObj: Record<string, unknown> = {}
  let event_row_id = 0
  if (!Number.isNaN(Number.parseInt(eventRowIdRaw))) {
    event_row_id = Number.parseInt(eventRowIdRaw)
  } else {
    errObj['event_row_id'] = 'The event row id field must be contain valid number.'
  }

  const orderedIds = Array.isArray(orderedIdsRaw)
    ? orderedIdsRaw.map((id) => Number.parseInt(String(id))).filter((id) => !Number.isNaN(id))
    : []
  if (!orderedIds.length) {
    errObj['ordered_ids'] = 'Sorry, nothing to reorder.'
  }

  const host_user_row_id = Number(checkUserToken.message.user_type) === 1 ? checkUserToken.message.user_row_id : 0
  if (event_row_id && host_user_row_id) {
    const check_event_res = await eventM.findOne({ _id: event_row_id, user_row_id: host_user_row_id })
    if (!check_event_res) {
      errObj['event_row_id'] = 'Invalid Event Row ID.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  if (isAdminPanelActor(checkUserToken)) {
    const actor = buildEventChangeRequestActor(checkUserToken)
    await Promise.all(
      orderedIds.map(async (faqId, index) => {
        const liveValues = (await findFaqByIdLean({ module: FAQ_MODULE, faqRowId: faqId })) ?? {}
        return submitChildChangeRequest({
          module: AUDIT_MODULE_EVENTS,
          section: SECTION_EVENT_FAQ,
          rootDocumentId: event_row_id,
          targetRowId: faqId,
          liveValues,
          submitted: { sort_order: index },
          actor,
        })
      }),
    )
    return { status: true, message: { alert_message: 'Submitted for approval - this order will apply once a full admin approves and publishes the change.' } }
  }

  await reorderFaqs({ module: FAQ_MODULE, rootDocumentId: event_row_id, orderedIds, actor: buildFaqActor(checkUserToken) })
  await invalidateFaqCaches()

  return { status: true, message: { alert_message: 'FAQ order has been updated successfully.' } }
}
