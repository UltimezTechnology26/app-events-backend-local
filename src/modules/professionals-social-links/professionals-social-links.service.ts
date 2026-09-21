// modules/professionals-social-links/professionals-social-links.service.ts
// Ports controllers/app/users/setting.js's /update_social_media_details (~855-918) and
// /update_user_social_media_details (~948-1005). Same behavior, same response shape, same
// validation quirks (see resolveUserRowIdFromBody's flagged bug below) — no new behavior.
import ProfessionalM from '../../../models/app/professionalsM'
import { ProfessionalSocialLinksM } from './professionals-social-links.models'
import { invalidateAfterAuthenticatedUpdate, invalidateAfterApiKeyOnlyUpdate } from './professionals-social-links.cache'
import type { SocialLinksBody, UserAuthResult } from './professionals-social-links.types'
import { submitChangeRequest } from '../../modules/change-request/change-request.service'
import { SECTION_PROFESSIONAL_SOCIAL_MEDIA } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'

const { calculateUserProfileScore } = require('../../../utils/helpers/app_helper')

const ADMIN_ROW_ID_MAIN_ADMIN = 0
const USER_TYPE_SELF = 1

interface ResolvedUserRowId {
  userRowId: number
  errorMessage?: string
}

// FLAGGED, NOT FIXED: legacy's non-numeric-user_row_id branch checks
// `professionalsM.findOne({ _id: user_row_id }, ...)` where `user_row_id` is still its initial `0`
// at that point — NOT the raw `req.body.user_row_id` that failed to parse. This means the "does
// this user exist" check always queries `_id: 0`, which (coincidentally, not by design) almost
// always fails and produces the "Invalid User Row ID" error. Ported bug-for-bug: fixing the query
// target would change which inputs are accepted, a real behavior change needing sign-off first.
async function resolveUserRowIdFromBody(bodyUserRowIdRaw: unknown): Promise<ResolvedUserRowId> {
  let userRowId = 0
  if (!bodyUserRowIdRaw) return { userRowId }

  const parsed = Number.parseInt(bodyUserRowIdRaw as string)
  if (!Number.isNaN(parsed)) {
    userRowId = parsed
    return { userRowId }
  }

  const checkUserQuery = await ProfessionalM.findOne({ _id: userRowId }, { _id: 1 })
  if (!checkUserQuery) {
    return { userRowId, errorMessage: 'Sorry, Invalid User Row ID.' }
  }
  return { userRowId }
}

function buildUpdateArray(body: SocialLinksBody, includeOtherSocialLinks: boolean) {
  const update: Record<string, unknown> = {
    facebook: body.facebook ? body.facebook.trim() : '',
    twitter: body.twitter ? body.twitter.trim() : '',
    linkedin: body.linkedin ? body.linkedin.trim() : '',
    video_link: body.video_link ? body.video_link.trim() : '',
    instagram: body.instagram ? body.instagram.trim() : '',
    telegram: body.telegram ? body.telegram.trim() : '',
    medium: body.medium ? body.medium.trim() : '',
    reddit: body.reddit ? body.reddit.trim() : '',
    youtube_channel: body.youtube_channel ? body.youtube_channel.trim() : '',
    feed_url: body.feed_url,
  }
  if (includeOtherSocialLinks) update.other_social_links = body.other_social_links
  return update
}

function hasAtLeastOneSocialField(body: SocialLinksBody, includeOtherSocialLinks: boolean): boolean {
  return !!(
    body.feed_url || body.facebook || body.twitter || body.linkedin || body.video_link ||
    body.instagram || body.telegram || body.reddit || body.medium || body.youtube_channel ||
    (includeOtherSocialLinks && body.other_social_links)
  )
}

export async function updateSocialMediaDetails(auth: UserAuthResult, body: SocialLinksBody) {
  if (!auth.status) {
    return { status: false, message: { alert_message: (auth as any).message } }
  }

  const errObj: Record<string, unknown> = {}
  let userRowId = 0

  if (auth.message.user_type === 1) {
    userRowId = auth.message.user_row_id
  } else if (body.user_row_id) {
    const resolved = await resolveUserRowIdFromBody(body.user_row_id)
    userRowId = resolved.userRowId
    if (resolved.errorMessage) errObj['alert_message'] = resolved.errorMessage
  }

  if (!hasAtLeastOneSocialField(body, true)) {
    errObj['alert_message'] = 'Please submit atleast one social media details.'
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const updateArray = buildUpdateArray(body, true)

  // Publish gate applies to admin-panel edits only (design §2, same shape as Company's own
  // updateCompanySocialLinks) — a professional editing their own social links keeps writing live
  // immediately, exactly as before.
  if (auth.message.user_type !== USER_TYPE_SELF) {
    const liveValues = (await ProfessionalSocialLinksM.findOne({ user_row_id: userRowId }).lean()) ?? {}
    const adminRowId = Number(auth.message.user_row_id)
    return submitChangeRequest({
      module: AUDIT_MODULE_PROFESSIONALS,
      section: SECTION_PROFESSIONAL_SOCIAL_MEDIA,
      rootDocumentId: userRowId,
      targetRowId: null,
      liveValues,
      submitted: updateArray,
      actor: toActorRefWithId(
        {
          updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: adminRowId,
        },
        adminRowId,
      ),
    })
  }

  await ProfessionalSocialLinksM.findOneAndUpdate({ user_row_id: userRowId }, { $set: updateArray }, { upsert: true })
  await invalidateAfterAuthenticatedUpdate()
  await calculateUserProfileScore(userRowId, ['social_media'])

  return {
    status: true,
    message: {
      alert_message: 'Your social media details have been updated successfully. We appreciate your diligence in keeping your information current!',
      update_array: updateArray,
    },
  }
}

export async function updateUserSocialMediaDetailsNoLogin(body: SocialLinksBody, preValidationErrors: Record<string, unknown>) {
  const errObj = { ...preValidationErrors }
  let userRowId = 0

  if (body.user_row_id) {
    const resolved = await resolveUserRowIdFromBody(body.user_row_id)
    userRowId = resolved.userRowId
    if (resolved.errorMessage) errObj['alert_message'] = resolved.errorMessage
  }

  if (!hasAtLeastOneSocialField(body, false)) {
    errObj['alert_message'] = 'Please submit atleast one social media details.'
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const updateArray = buildUpdateArray(body, false)
  await ProfessionalSocialLinksM.findOneAndUpdate({ user_row_id: userRowId }, { $set: updateArray }, { upsert: true })
  await invalidateAfterApiKeyOnlyUpdate()

  return {
    status: true,
    message: { alert_message: 'Your social media details have been updated successfully. We appreciate your diligence in keeping your information current!' },
  }
}
