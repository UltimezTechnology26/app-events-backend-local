// modules/company/company.faq.service.ts
//
// Migrated onto the shared cln_app_faqs collection (src/common/app-faq) with module: 'company' -
// Company's own leg of the FAQ-unification migration (Events was the pilot). DB-only schema
// alignment with markets' own cln_faqs (question/answer/sort_order/status/timestamps/actor-
// tracking) - the HTTP contract is UNCHANGED (faq_question/faq_answer in every request/response).
// Every function below maps wire <-> storage field names at its own boundary, same as
// events-faq.service.ts.
const { checkCompanyRowID, deleteFAQ, calculateCompanyProfileScore } = require('../../../../utils/helpers/app_helper')
const { getUpdateTrackerFields } = require('@ultimez-interview/coinpedia-backend-library/auth')
import {
  findFaqByIdAndRoot,
  findFaqByIdAndRootLean,
  findFaqById,
  findFaqByIdLean,
  getNextSortOrder,
  insertFaq,
  updateFaqById,
  aggregateFaqList,
  buildFaqSearchMatch,
  reorderFaqs,
} from '../../../common/app-faq/app-faq.repository'
import { FaqActorRef } from '../../../common/app-faq/app-faq.model'
import { extractPaginatedResult } from '../../common/common.pagination'
import { invalidateFaqCaches, buildFaqListKey, getCache, setCache } from './company.faq.cache'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../../modules/change-request/change-request.child.service'
import { computeDiff } from '../../../modules/change-request/change-request.diff'
import { SECTION_REGISTRY, SECTION_FAQ } from '../../../modules/change-request/change-request.registry'
import { toActorRefWithId } from '../../../common/status-audit/status-audit.actor'
import { AUDIT_MODULE_COMPANY } from '../../../common/status-audit/status-audit.registry'
import { insertChangeLog } from '../../../common/status-audit/status-audit.queries'
import logger from '../../../../config/logger'

const FAQ_MODULE = 'company' as const

interface ActorMessage {
  user_type?: number
  user_row_id?: number
}

interface Actor {
  status: boolean
  message: ActorMessage
}

export interface SaveFaqDetailsParams {
  actor: Actor
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

const USER_TYPE_COMPANY_OWNER = 1
const ADMIN_ROW_ID_MAIN_ADMIN = 0
const LOG_ACTION_CREATE = 'create'
const LOG_ACTION_UPDATE = 'update'

// Row-level created_by/updated_by stamp - independent of (and simpler than) the change-request
// system's own ActorRef/audit trail, which already records who requested/approved/published a
// change at the change_request level. Matches events-faq.service.ts's own buildFaqActor exactly.
function buildFaqActor(actor: Actor): FaqActorRef {
  const trackerFields = getUpdateTrackerFields(actor)
  return { type: trackerFields.updated_by ?? 'user', id: trackerFields.updated_by_row_id ?? 0 }
}

/** Ports faq.js's POST /update_faq_details (lines 11-91) — creates a new FAQ row, or updates an existing one when body.faq_row_id is a valid row belonging to the same company. */
export async function saveOrUpdateFaqDetails({ actor, body, preValidationErrors }: SaveFaqDetailsParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, any> = { ...preValidationErrors }
  let company_row_id = 0
  let faq_row_id = 0

  if (!Number.isNaN(Number.parseFloat(body.company_row_id))) {
    company_row_id = Number.parseInt(body.company_row_id)
    if (actor.message.user_type == 1) {
      const user_row_id = actor.message.user_row_id
      const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
      if (!check_company.status) {
        errObj['company_row_id'] = check_company.message.alert_message
      }
    }

    if (body.faq_row_id) {
      if (!Number.isNaN(Number.parseInt(body.faq_row_id))) {
        const check_valid_faq_query = await findFaqByIdAndRoot({ module: FAQ_MODULE, faqRowId: Number.parseInt(body.faq_row_id), rootDocumentId: company_row_id })
        if (check_valid_faq_query) {
          faq_row_id = Number.parseInt(body.faq_row_id)
        } else {
          errObj['alert_message'] = 'Sorry, Invalid FAQ Row ID.'
        }
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  // Wire -> storage: the HTTP body still carries faq_question/faq_answer (frontend's own
  // contract, unchanged) - mapped to the DB's question/answer fields right here.
  const storageFields = {
    question: body.faq_question,
    answer: body.faq_answer,
  }
  const faqActor = buildFaqActor(actor)

  // Publish gate applies to admin-panel edits only (design §2), same branch shape as
  // updateCompanySeo / saveOrUpdateSocialDetails.
  const isFaqCompanyOwner = Number(actor.message.user_type) === USER_TYPE_COMPANY_OWNER
  if (!isFaqCompanyOwner) {
    const liveValues = faq_row_id
      ? ((await findFaqByIdAndRootLean({ module: FAQ_MODULE, faqRowId: faq_row_id, rootDocumentId: company_row_id })) ?? {})
      : {}
    const actorRowId = Number(actor.message.user_row_id)
    // A still-pending CREATE needs its own sort_order riding along in `submitted` (an
    // admin-approved creation never goes through insertFaq's own getNextSortOrder call) -
    // computed now, not left to the schema's sort_order:0 default, which every admin-approved
    // creation would otherwise collide on.
    const submitted = faq_row_id ? storageFields : { ...storageFields, sort_order: await getNextSortOrder({ module: FAQ_MODULE, rootDocumentId: company_row_id }) }
    return submitChildChangeRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_FAQ,
      rootDocumentId: company_row_id,
      targetRowId: faq_row_id || null,
      liveValues,
      submitted,
      actor: toActorRefWithId(
        {
          updated_by: actorRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: actorRowId,
        },
        actorRowId,
      ),
    })
  }

  const ownerRowId = Number(actor.message.user_row_id)
  const ownerActor = toActorRefWithId({ updated_by: 'user', updated_by_row_id: ownerRowId }, ownerRowId)

  if (faq_row_id) {
    const preWriteFaqValues = (await findFaqByIdAndRootLean({ module: FAQ_MODULE, faqRowId: faq_row_id, rootDocumentId: company_row_id })) ?? {}

    await updateFaqById({ module: FAQ_MODULE, faqRowId: faq_row_id, updateObject: storageFields, actor: faqActor })
    await invalidateFaqCaches()

    const ownerFaqChanges = await computeDiff({
      before: preWriteFaqValues,
      submitted: storageFields,
      schemaPaths: SECTION_REGISTRY[SECTION_FAQ].schemaPaths,
      editableFields: SECTION_REGISTRY[SECTION_FAQ].editableFields,
    })
    if (ownerFaqChanges.length > 0) {
      try {
        await insertChangeLog({
          module: AUDIT_MODULE_COMPANY,
          target_collection: 'cln_app_faqs',
          target_row_id: faq_row_id,
          root_document_id: company_row_id,
          section: SECTION_FAQ,
          action: LOG_ACTION_UPDATE,
          actor: ownerActor,
          changes: ownerFaqChanges,
          reason: null,
          snapshot: null,
        })
      } catch (err) {
        logger.error({ err, company_row_id, faq_row_id }, 'company.faq: owner update change log write failed')
      }
    }

    return { status: true, message: { alert_message: 'This FAQ details has been updated successfully.' } }
  }

  const inserted = await insertFaq({ module: FAQ_MODULE, rootDocumentId: company_row_id, question: body.faq_question, answer: body.faq_answer, actor: faqActor })
  await invalidateFaqCaches()
  await calculateCompanyProfileScore(company_row_id, ['faq'])

  const ownerFaqCreateChanges = await computeDiff({
    before: {},
    submitted: storageFields,
    schemaPaths: SECTION_REGISTRY[SECTION_FAQ].schemaPaths,
    editableFields: SECTION_REGISTRY[SECTION_FAQ].editableFields,
  })
  try {
    await insertChangeLog({
      module: AUDIT_MODULE_COMPANY,
      target_collection: 'cln_app_faqs',
      target_row_id: Number(inserted._id),
      root_document_id: company_row_id,
      section: SECTION_FAQ,
      action: LOG_ACTION_CREATE,
      actor: ownerActor,
      changes: ownerFaqCreateChanges,
      reason: null,
      snapshot: null,
    })
  } catch (err) {
    logger.error({ err, company_row_id }, 'company.faq: owner create change log write failed')
  }

  return { status: true, message: { alert_message: 'New FAQ details has been listed successfully.' } }
}

export interface GetFaqListParams {
  actor: Actor
  companyRowIdRaw: string
  skipRaw: string
  limitRaw: string
  search?: string
}

/** Ports faq.js's GET /list/:company_row_id/:skip/:limit (lines 93-188), $facet-converted per the standing list+count fix. */
export async function getFaqList({ actor, companyRowIdRaw, skipRaw, limitRaw, search }: GetFaqListParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, any> = {}

  if (Number.isNaN(Number.parseInt(skipRaw))) {
    errObj['skip'] = 'The parameter skip field must be contain valid number'
  }
  if (Number.isNaN(Number.parseInt(limitRaw))) {
    errObj['limit'] = 'The parameter limit field must be contain valid number.'
  }

  let company_row_id = 0
  if (!Number.isNaN(Number.parseInt(companyRowIdRaw))) {
    company_row_id = Number.parseInt(companyRowIdRaw)
  } else {
    errObj['company_row_id'] = 'The company row id field must be contain valid number.'
  }

  if (company_row_id && actor.message.user_type == 1) {
    const user_row_id = actor.message.user_row_id
    const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
    if (!check_company.status) {
      errObj['company_row_id'] = check_company.message.alert_message
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const skip = Number.parseInt(skipRaw)
  const limit = Number.parseInt(limitRaw)
  const key = buildFaqListKey({ companyRowId: company_row_id, search, skip, limit })

  const cache_response = await getCache<{ list: unknown[]; count: number }>({ key })
  if (cache_response.status) {
    return { status: true, message: cache_response.message.list, count: cache_response.message.count, cache_reponse_status: true }
  }

  const searchMatch = buildFaqSearchMatch({ module: FAQ_MODULE, rootDocumentId: company_row_id, search })
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

export interface DeleteFaqParams {
  actor: Actor
  faqRowIdRaw: string
}

/** Ports faq.js's GET /delete_faq/:faq_row_id (lines 191-246). */
export async function deleteFaqDetail({ actor, faqRowIdRaw }: DeleteFaqParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, any> = {}
  let user_row_id = 0
  let faq_row_id = 0
  let company_row_id = 0

  if (actor.message.user_type == 1) {
    user_row_id = actor.message.user_row_id ?? 0
  }

  if (Number.isNaN(Number.parseInt(faqRowIdRaw))) {
    errObj['faq_row_id'] = 'The faq row id field must be contain valid number.'
  } else {
    faq_row_id = Number.parseInt(faqRowIdRaw)
    const check_query = await findFaqById({ module: FAQ_MODULE, faqRowId: faq_row_id })
    if (!check_query) {
      errObj['faq_row_id'] = 'Invalid faq row id.'
    } else {
      company_row_id = check_query.root_document_id ?? 0
      if (company_row_id && user_row_id) {
        const check_event_res = await checkCompanyRowID({ company_row_id, user_row_id })
        if (!check_event_res.status) {
          errObj['alert_message'] = check_event_res.message.alert_message
        }
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const rowSnapshot = (await findFaqByIdLean({ module: FAQ_MODULE, faqRowId: faq_row_id })) ?? {}

  // Publish gate applies to admin-panel edits only (design §2).
  const isDeleteCompanyOwner = Number(actor.message.user_type) === USER_TYPE_COMPANY_OWNER
  if (!isDeleteCompanyOwner) {
    const actorRowId = Number(actor.message.user_row_id)
    return submitChildDeleteRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_FAQ,
      rootDocumentId: company_row_id,
      targetRowId: faq_row_id,
      rowSnapshot,
      actor: toActorRefWithId(
        {
          updated_by: actorRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: actorRowId,
        },
        actorRowId,
      ),
    })
  }

  await deleteFAQ({ type: 1, company_row_id, faq_row_id })
  await invalidateFaqCaches()
  await calculateCompanyProfileScore(company_row_id, ['faq'])

  try {
    await insertChangeLog({
      module: AUDIT_MODULE_COMPANY,
      target_collection: 'cln_app_faqs',
      target_row_id: faq_row_id,
      root_document_id: company_row_id,
      section: SECTION_FAQ,
      action: 'delete',
      actor: toActorRefWithId({ updated_by: 'user', updated_by_row_id: Number(actor.message.user_row_id) }, Number(actor.message.user_row_id)),
      changes: [],
      reason: null,
      snapshot: rowSnapshot,
    })
  } catch (err) {
    logger.error({ err, company_row_id, faq_row_id }, 'company.faq: owner delete change log write failed')
  }

  return { status: true, message: { alert_message: 'This FAQ details for this company have been deleted successfully.' } }
}

export interface ReorderFaqParams {
  actor: Actor
  companyRowIdRaw: string
  orderedIdsRaw: unknown
}

// New - Company had no reorder route before this migration (unlike markets, whose drag-reorder UI
// this mirrors). Submits one per-row child change request for an admin actor (each diffing only
// that row's own sort_order, reusing the EXISTING field-diff engine), or writes straight through
// reorderFaqs for the company's own owner, matching every other FAQ action's existing
// live-vs-staged split. Mirrors events-faq.service.ts's own reorderFaqDetails exactly.
export async function reorderFaqDetails({ actor, companyRowIdRaw, orderedIdsRaw }: ReorderFaqParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, any> = {}
  let company_row_id = 0
  if (!Number.isNaN(Number.parseInt(companyRowIdRaw))) {
    company_row_id = Number.parseInt(companyRowIdRaw)
  } else {
    errObj['company_row_id'] = 'The company row id field must be contain valid number.'
  }

  const orderedIds = Array.isArray(orderedIdsRaw)
    ? orderedIdsRaw.map((id) => Number.parseInt(String(id))).filter((id) => !Number.isNaN(id))
    : []
  if (!orderedIds.length) {
    errObj['ordered_ids'] = 'Sorry, nothing to reorder.'
  }

  if (company_row_id && actor.message.user_type == 1) {
    const user_row_id = actor.message.user_row_id
    const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
    if (!check_company.status) {
      errObj['company_row_id'] = check_company.message.alert_message
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const isFaqCompanyOwner = Number(actor.message.user_type) === USER_TYPE_COMPANY_OWNER
  if (!isFaqCompanyOwner) {
    const actorRowId = Number(actor.message.user_row_id)
    const changeRequestActor = toActorRefWithId(
      { updated_by: actorRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin', updated_by_row_id: actorRowId },
      actorRowId,
    )
    await Promise.all(
      orderedIds.map(async (faqId, index) => {
        const liveValues = (await findFaqByIdLean({ module: FAQ_MODULE, faqRowId: faqId })) ?? {}
        return submitChildChangeRequest({
          module: AUDIT_MODULE_COMPANY,
          section: SECTION_FAQ,
          rootDocumentId: company_row_id,
          targetRowId: faqId,
          liveValues,
          submitted: { sort_order: index },
          actor: changeRequestActor,
        })
      }),
    )
    return { status: true, message: { alert_message: 'Submitted for approval - this order will apply once a full admin approves and publishes the change.' } }
  }

  await reorderFaqs({ module: FAQ_MODULE, rootDocumentId: company_row_id, orderedIds, actor: buildFaqActor(actor) })
  await invalidateFaqCaches()

  return { status: true, message: { alert_message: 'FAQ order has been updated successfully.' } }
}
