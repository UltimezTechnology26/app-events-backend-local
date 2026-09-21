// modules/professionals-awards/professionals-awards.service.ts
// Ports controllers/app/users/awards.js in full (3 routes): /update_n_save_details, /list/:skip/:limit,
// /delete_award/:award_row_id. Same behavior, same response shapes, same validation quirks.
import sanitize from 'mongo-sanitize'
import { ProfessionalsAwardsM } from './professionals-awards.models'
import type { UpdateAwardBody, UserAuthResult } from './professionals-awards.types'
import { submitChildChangeRequest, submitChildDeleteRequest } from '../../modules/change-request/change-request.child.service'
import { SECTION_PROFESSIONAL_AWARDS } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'

const { validateAndSaveImage, deleteImageDigitalOcean } = require('../../../utils/helpers/helper')
const { deleteUserAward, calculateUserProfileScore } = require('../../../utils/helpers/app_helper')
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
  const parsed = Number.parseFloat(String(fallbackRaw))
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function updateAndSaveAward(auth: UserAuthResult, body: UpdateAwardBody, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = { ...preValidationErrors }
  const userRowId = resolveUserRowId(auth, body.user_row_id)

  if (body.award_image && body.award_image.length < 100) {
    errObj['award_image'] = 'The award image field must be at least 100 characters in length.'
  }

  let awardImage = ''
  if (Object.keys(errObj).length === 0) {
    const validateNSaveImage = await validateAndSaveImage(body.award_image, 8)
    if (validateNSaveImage.status) awardImage = validateNSaveImage.webp_file_name
  }

  let awardRowId = 0
  let oldImageName: string | undefined
  if (body.award_row_id) {
    const parsedAwardRowId = Number.parseFloat(String(body.award_row_id))
    if (!Number.isNaN(parsedAwardRowId)) {
      const checkValidAwardQuery = await ProfessionalsAwardsM.findOne({ _id: parsedAwardRowId, user_row_id: userRowId })
      if (checkValidAwardQuery) {
        awardRowId = Number.parseInt(String(body.award_row_id))
        oldImageName = checkValidAwardQuery.award_image ?? undefined
      } else {
        errObj['alert_message'] = 'Sorry, Invalid Award Row ID.'
      }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const updateObject: Record<string, unknown> = { award_title: body.award_title, award_description: body.award_description }
  if (awardImage) {
    updateObject['award_image'] = awardImage
    if (oldImageName) await deleteImageDigitalOcean(oldImageName, 8)
  }

  // Publish gate applies to admin-panel edits only (design §2) — a professional editing their
  // own awards keeps writing live immediately, exactly as before.
  if (auth.message.user_type !== USER_TYPE_SELF) {
    if (awardRowId) {
      const liveValues = (await ProfessionalsAwardsM.findOne({ _id: awardRowId }).lean()) ?? {}
      return submitChildChangeRequest({
        module: AUDIT_MODULE_PROFESSIONALS,
        section: SECTION_PROFESSIONAL_AWARDS,
        rootDocumentId: userRowId,
        targetRowId: awardRowId,
        liveValues,
        submitted: updateObject,
        actor: adminActorOf(auth)!,
      })
    }

    return submitChildChangeRequest({
      module: AUDIT_MODULE_PROFESSIONALS,
      section: SECTION_PROFESSIONAL_AWARDS,
      rootDocumentId: userRowId,
      targetRowId: null,
      liveValues: {},
      submitted: { ...updateObject, user_row_id: userRowId },
      actor: adminActorOf(auth)!,
    })
  }

  if (awardRowId) {
    await ProfessionalsAwardsM.updateOne({ _id: awardRowId }, { $set: updateObject })
    await Promise.all([deleteKeysByPattern('users_awards_list_*'), deleteKeysByPattern('app_user_other_details_*')])
    return { status: true, message: { alert_message: 'This Awards details has been updated successfully.' } }
  }

  updateObject['user_row_id'] = userRowId
  await new ProfessionalsAwardsM(updateObject).save()
  await Promise.all([deleteKeysByPattern('users_awards_list_*'), deleteKeysByPattern('app_user_other_details_*')])
  await calculateUserProfileScore(userRowId, ['award'])
  return { status: true, message: { alert_message: 'New Awards details has been listed successfully.' } }
}

export async function getAwardsList(auth: UserAuthResult, skipRaw: string, limitRaw: string, queryUserRowIdRaw: unknown, searchRaw: unknown) {
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
  if (searchRaw) query.push({ award_title: { $regex: sanitize(searchRaw), $options: 'i' } })
  const searchQuery = { $and: query }

  const key = `users_awards_list_${userRowId}_${searchRaw || ''}_${skip}_${limit}`

  const cacheResponse = await getCache({ key })
  if (cacheResponse.status) {
    return { status: true, message: cacheResponse.message.data, count: cacheResponse.message.count, cache_response_status: true }
  }

  const [getQuery, countQuery] = await Promise.all([
    ProfessionalsAwardsM.aggregate([
      { $match: searchQuery },
      { $sort: { _id: -1 } },
      { $project: { _id: 1, user_row_id: 1, award_title: 1, award_description: 1, award_image: 1 } },
    ]).skip(skip).limit(limit),
    ProfessionalsAwardsM.countDocuments(searchQuery),
  ])

  await setCache({ key, value: { data: getQuery, count: countQuery }, ttl: 1800 })

  return { status: true, message: getQuery, count: countQuery, cache_response_status: false }
}

export async function deleteAward(auth: UserAuthResult, awardRowIdRaw: string, queryUserRowIdRaw: unknown) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = {}
  const userRowId = resolveUserRowId(auth, queryUserRowIdRaw)

  let awardImage = ''
  let awardRowId = 0
  let rowSnapshot: Record<string, unknown> = {}
  if (Number.isNaN(Number.parseInt(awardRowIdRaw))) {
    errObj['award_row_id'] = 'The award row id field must be contain valid number.'
  } else {
    awardRowId = Number.parseInt(awardRowIdRaw)
    const checkQuery = await ProfessionalsAwardsM.findOne({ _id: awardRowId, user_row_id: userRowId })
    if (!checkQuery) {
      errObj['award_row_id'] = 'Invalid award row id.'
    } else {
      if (checkQuery.award_image) awardImage = checkQuery.award_image
      rowSnapshot = typeof checkQuery.toObject === 'function' ? checkQuery.toObject() : { ...checkQuery }
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  // Publish gate applies to admin-panel edits only (design §2) — a professional deleting their
  // own award keeps writing live immediately, exactly as before.
  if (auth.message.user_type !== USER_TYPE_SELF) {
    return submitChildDeleteRequest({
      module: AUDIT_MODULE_PROFESSIONALS,
      section: SECTION_PROFESSIONAL_AWARDS,
      rootDocumentId: userRowId,
      targetRowId: awardRowId,
      rowSnapshot,
      actor: adminActorOf(auth)!,
    })
  }

  await deleteUserAward({ type: 1, user_row_id: userRowId, award_row_id: awardRowId, award_image: awardImage })
  await deleteKeysByPattern('users_awards_list_*')
  await calculateUserProfileScore(userRowId, ['award'])

  return { status: true, message: { alert_message: 'This award details for this user have been deleted successfully.' } }
}
