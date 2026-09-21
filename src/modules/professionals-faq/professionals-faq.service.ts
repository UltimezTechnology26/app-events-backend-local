// modules/professionals-faq/professionals-faq.service.ts
// Ports controllers/app/users/faq.js in full (3 routes): /update_faq_details, /list/:skip/:limit,
// /delete_faq/:faq_row_id. Same behavior, same response shapes — including the `cache_reponse_status`
// (missing 's') typo in the list route's response key, preserved as-is.
import sanitize from 'mongo-sanitize'
import { ProfessionalsFaqM } from './professionals-faq.models'
import type { UpdateFaqBody, UserAuthResult } from './professionals-faq.types'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../modules/change-request/change-request.child.service'
import { SECTION_PROFESSIONAL_FAQ } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'

const { deleteUserFAQ, calculateUserProfileScore } = require('../../../utils/helpers/app_helper')
const { getCache, setCache, deleteKeysByPattern } = require('../../../config/cache_helper')

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
      const checkValidFaqQuery = await ProfessionalsFaqM.findOne({ _id: parsedFaqRowId, user_row_id: userRowId })
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

  const updateObject: Record<string, unknown> = { faq_question: body.faq_question, faq_answer: body.faq_answer }

  // Publish gate applies to admin-panel edits only (design §2) — a professional editing their
  // own FAQ's keeps writing live immediately, exactly as before.
  if (auth.message.user_type !== USER_TYPE_SELF) {
    if (faqRowId) {
      const liveValues = (await ProfessionalsFaqM.findOne({ _id: faqRowId }).lean()) ?? {}
      return submitChildChangeRequest({
        module: AUDIT_MODULE_PROFESSIONALS,
        section: SECTION_PROFESSIONAL_FAQ,
        rootDocumentId: userRowId,
        targetRowId: faqRowId,
        liveValues,
        submitted: updateObject,
        actor: adminActorOf(auth)!,
      })
    }

    return submitChildChangeRequest({
      module: AUDIT_MODULE_PROFESSIONALS,
      section: SECTION_PROFESSIONAL_FAQ,
      rootDocumentId: userRowId,
      targetRowId: null,
      liveValues: {},
      submitted: { ...updateObject, user_row_id: userRowId },
      actor: adminActorOf(auth)!,
    })
  }

  if (faqRowId) {
    await ProfessionalsFaqM.updateOne({ _id: faqRowId }, { $set: updateObject })
    await Promise.all([deleteKeysByPattern('user_faq_list_*'), deleteKeysByPattern('app_user_other_details_*')])
    return { status: true, message: { alert_message: 'This FAQ details has been updated successfully.' } }
  }

  updateObject['user_row_id'] = userRowId
  await new ProfessionalsFaqM(updateObject).save()
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

  const query: Record<string, unknown>[] = [{ user_row_id: userRowId }]
  if (searchRaw) query.push({ faq_question: { $regex: sanitize(searchRaw), $options: 'i' } })
  const searchQuery = { $and: query }

  const key = `user_faq_list_${userRowId}_${searchRaw || ''}_${skip}_${limit}`

  const cacheResponse = await getCache({ key })
  if (cacheResponse.status) {
    return { status: true, message: cacheResponse.message.list, count: cacheResponse.message.count, cache_reponse_status: true }
  }

  const [getQuery, countQuery] = await Promise.all([
    ProfessionalsFaqM.aggregate([
      { $match: searchQuery },
      { $sort: { _id: -1 } },
      { $project: { _id: 1, user_row_id: 1, faq_question: 1, faq_answer: 1 } },
    ]).skip(skip).limit(limit),
    ProfessionalsFaqM.countDocuments(searchQuery),
  ])

  await setCache({ key, value: { list: getQuery, count: countQuery }, ttl: 1800 })

  return { status: true, message: getQuery, count: countQuery, cache_reponse_status: false }
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
    const checkQuery = await ProfessionalsFaqM.findOne({ _id: faqRowId, user_row_id: userRowId })
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
