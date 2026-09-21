// modules/professionals-profile-images/professionals-profile-images.service.ts
// Ports controllers/app/users/setting.js's /update_profile_image (~1767-1877) and
// /remove_profile_image (~1879-1939). Same behavior, same response shape — one confirmed
// no-behavior-change cleanup (deduped double cache invalidation, see .cache.ts) and one flagged,
// NOT fixed, pre-existing gap noted below.
import ProfessionalM from '../../../models/app/professionalsM'
import { ProfessionalProfileImagesM, DefaultProfileImgM } from './professionals-profile-images.models'
import { invalidateProfileImageCaches } from './professionals-profile-images.cache'
import type { UpdateProfileImageBody, UserAuthResult } from './professionals-profile-images.types'

const { getPresentDateTime, validateAndSaveImage, deleteImageDigitalOcean } = require('../../../utils/helpers/helper')
const { calculateUserProfileScore } = require('../../../utils/helpers/app_helper')

const MIN_PROFILE_IMAGE_LENGTH = 100
const DIGITAL_OCEAN_IMAGE_TYPE = 1

// Same buggy-but-faithfully-ported resolution as professionals-social-links.service.ts's
// resolveUserRowIdFromBody: the non-numeric branch checks `_id: user_row_id` (still 0 at that
// point), not the raw unparsed value. Ported bug-for-bug — see that module's comment for why.
async function resolveUserRowId(userType: number, tokenUserRowId: number, rawUserRowId: unknown): Promise<{ userRowId: number; errorMessage?: string }> {
  if (userType === 1) return { userRowId: tokenUserRowId }
  if (!rawUserRowId) return { userRowId: 0, errorMessage: 'The User Row ID field is required.' }

  const parsed = Number.parseInt(rawUserRowId as string)
  if (!Number.isNaN(parsed)) return { userRowId: parsed }

  const checkUserQuery = await ProfessionalM.findOne({ _id: 0 }, { _id: 1 })
  if (!checkUserQuery) return { userRowId: 0, errorMessage: 'Sorry, Invalid User Row ID.' }
  return { userRowId: 0 }
}

export async function updateProfileImage(auth: UserAuthResult, body: UpdateProfileImageBody, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = { ...preValidationErrors }
  const { userRowId, errorMessage } = await resolveUserRowId(auth.message.user_type, auth.message.user_row_id, body.user_row_id)
  if (errorMessage) errObj['alert_message'] = errorMessage

  const profileImageType = body.profile_image_type
  let defaultProfileImage = ''

  if (Number.parseInt(profileImageType as string) <= 0) {
    if (!body.profile_image) {
      errObj['profile_image'] = 'The profile image field is required.'
    } else if (body.profile_image.length < MIN_PROFILE_IMAGE_LENGTH) {
      errObj['profile_image'] = `The profile image field must be at least ${MIN_PROFILE_IMAGE_LENGTH} characters in length.`
    }
  } else {
    const imageQuery = await DefaultProfileImgM.findOne({ _id: Number.parseInt(profileImageType as string) }, { image_name: 1 })
    if (imageQuery) defaultProfileImage = imageQuery.image_name
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  let profileImage = defaultProfileImage
  if (!defaultProfileImage && body.profile_image) {
    const validateNSaveImage = await validateAndSaveImage(body.profile_image, DIGITAL_OCEAN_IMAGE_TYPE)
    if (validateNSaveImage.status) profileImage = validateNSaveImage.webp_file_name
  }

  const queryRun = await ProfessionalProfileImagesM.findOne({ user_row_id: userRowId }, { profile_image: 1, profile_image_type: 1 })

  if (queryRun) {
    if ((queryRun.profile_image_type ?? 0) > 0) {
      const imageQuery = await DefaultProfileImgM.findOne({ image_name: queryRun.profile_image }, { _id: 1 })
      if (!imageQuery) await deleteImageDigitalOcean(queryRun.profile_image, DIGITAL_OCEAN_IMAGE_TYPE)
    }
    await ProfessionalM.updateOne({ _id: userRowId }, { $set: { updated_date_n_time: getPresentDateTime() } })
    // FLAGGED, NOT FIXED: legacy invalidates zero cache keys on this "existing image row" update
    // path (only the "brand new row" insert path below does). Preserved as-is — adding
    // invalidation here would be a real behavior change (fresher cached responses after an
    // update), not a no-op cleanup, so it needs explicit sign-off first.
    await ProfessionalProfileImagesM.updateOne({ user_row_id: userRowId }, { $set: { profile_image_type: profileImageType, profile_image: profileImage } })
  } else {
    await new ProfessionalProfileImagesM({ user_row_id: userRowId, profile_image: profileImage, profile_image_type: profileImageType }).save()
    await invalidateProfileImageCaches()
    await ProfessionalM.updateOne({ _id: userRowId }, { $set: { updated_date_n_time: getPresentDateTime() } })
  }

  await calculateUserProfileScore(userRowId, ['professional_profile'])

  return { status: true, message: { alert_message: 'Profile image updated successfully..!' } }
}

export async function removeProfileImage(auth: UserAuthResult, rawUserRowId: unknown) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = {}
  const { userRowId, errorMessage } = await resolveUserRowId(auth.message.user_type, auth.message.user_row_id, rawUserRowId)
  if (errorMessage) errObj['alert_message'] = errorMessage

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const queryRun = await ProfessionalProfileImagesM.findOne({ user_row_id: userRowId }, { profile_image: 1, profile_image_type: 1 })

  if (queryRun) {
    if ((queryRun.profile_image_type ?? 0) > 0) {
      const imageQuery = await DefaultProfileImgM.findOne({ image_name: queryRun.profile_image }, { _id: 1 })
      if (!imageQuery) await deleteImageDigitalOcean(queryRun.profile_image, DIGITAL_OCEAN_IMAGE_TYPE)
    }
    await ProfessionalProfileImagesM.deleteOne({ user_row_id: userRowId })
    await invalidateProfileImageCaches()
  }

  await calculateUserProfileScore(userRowId, ['professional_profile'])

  return { status: true, message: { alert_message: 'Profile image removed successfully..!' } }
}
