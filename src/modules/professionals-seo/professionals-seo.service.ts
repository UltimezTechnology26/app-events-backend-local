// modules/professionals-seo/professionals-seo.service.ts
// Ports controllers/app/users/setting.js's /update_user_seo (~2378-2514) and
// /get_user_seo/:user_row_id (~2519-2779). Same behavior, same response shape.
import ProfessionalM from '../../../models/app/professionalsM'
import { ProfessionalSeoDetailsM } from './professionals-seo.models'
import { getUserSeoAggregate } from './professionals-seo.queries'
import { invalidateAfterSeoUpdate } from './professionals-seo.cache'
import type { UpdateUserSeoBody, UserAuthResult } from './professionals-seo.types'
import { submitChangeRequest } from '../../modules/change-request/change-request.service'
import { SECTION_PROFESSIONAL_SEO } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'

const ADMIN_ROW_ID_MAIN_ADMIN = 0
const USER_TYPE_SELF = 1

const SeoChangeLogsM = require('../../../models/seo_change_logsM')
const { calculateUserProfileScore } = require('../../../utils/helpers/app_helper')

const SEO_FIELD_KEYS = [
  'meta_title', 'meta_description', 'meta_keywords', 'og_title', 'og_description',
  'twitter_title', 'twitter_description', 'robots_index', 'robots_follow', 'twitter_creator',
] as const

export async function updateUserSeo(auth: UserAuthResult, body: UpdateUserSeoBody) {
  if (!auth.status) return auth

  const condition: { _id: number } = { _id: Number(body.module_id) }
  if (auth.message.user_type === 1) {
    condition._id = auth.message.user_row_id
  }

  const userData = await ProfessionalM.findOne(condition)
  if (!userData) {
    return { status: false, message: { alert_message: 'Invalid User ID.' } }
  }

  // FLAGGED, NOT FIXED (real pre-existing bug, not hypothetical): legacy never null-checks
  // checkQuery before reading `checkQuery.meta_title` etc. below — if this professional has no
  // `cln_professionals_seo_details` row yet, this throws a TypeError, caught by the outer
  // try/catch as a generic "unexpected error" instead of creating the row. In practice every
  // professional gets an initial SEO-details row on creation (professionals.service.ts), so this
  // is latent rather than commonly hit — but it is a real gap, not fixed here since adding
  // null-safety + upsert would be a genuine behavior change (this route currently can't create a
  // first-time SEO row at all) needing sign-off first.
  const checkQuery: any = await ProfessionalSeoDetailsM.findOne({ user_row_id: condition._id })

  const updateData = {
    meta_title: body.meta_title,
    meta_description: body.meta_description,
    meta_keywords: body.meta_keywords,
    robots_index: body.robots_index,
    robots_follow: body.robots_follow,
    twitter_creator: body.twitter_creator,
    og_title: body.og_title,
    og_description: body.og_description,
    twitter_title: body.twitter_title,
    twitter_description: body.twitter_description,
  }

  // Publish gate applies to admin-panel edits only (design §2, same shape as Company's own
  // updateCompanySeo) — a professional editing their own SEO details keeps writing live
  // immediately, exactly as before.
  if (auth.message.user_type !== USER_TYPE_SELF) {
    const adminRowId = Number(auth.message.user_row_id)
    return submitChangeRequest({
      module: AUDIT_MODULE_PROFESSIONALS,
      section: SECTION_PROFESSIONAL_SEO,
      rootDocumentId: condition._id,
      targetRowId: null,
      liveValues: checkQuery ?? {},
      submitted: updateData,
      actor: toActorRefWithId(
        {
          updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: adminRowId,
        },
        adminRowId,
      ),
    })
  }

  const seoChanged = SEO_FIELD_KEYS.some((key) => (body as any)[key] !== checkQuery[key])

  if (seoChanged) {
    await SeoChangeLogsM.create({
      module_key: 'professional',
      module_id: body.module_id,
      old_meta_title: checkQuery.meta_title || '',
      new_meta_title: body.meta_title === checkQuery.meta_title ? '' : body.meta_title,
      old_meta_description: checkQuery.meta_description || '',
      new_meta_description: body.meta_description === checkQuery.meta_description ? '' : body.meta_description,
      old_meta_keywords: checkQuery.meta_keywords || '',
      new_meta_keywords: body.meta_keywords === checkQuery.meta_keywords ? '' : body.meta_keywords,
      old_og_title: checkQuery.og_title || '',
      new_og_title: body.og_title === checkQuery.og_title ? '' : body.og_title,
      old_og_description: checkQuery.og_description || '',
      new_og_description: body.og_description === checkQuery.og_description ? '' : body.og_description,
      old_twitter_title: checkQuery.twitter_title || '',
      new_twitter_title: body.twitter_title === checkQuery.twitter_title ? '' : body.twitter_title,
      old_twitter_description: checkQuery.twitter_description || '',
      new_twitter_description: body.twitter_description === checkQuery.twitter_description ? '' : body.twitter_description,
      old_robots_index: checkQuery.robots_index || '',
      new_robots_index: body.robots_index === checkQuery.robots_index ? '' : body.robots_index,
      old_robots_follow: checkQuery.robots_follow || '',
      new_robots_follow: body.robots_follow === checkQuery.robots_follow ? '' : body.robots_follow,
      old_twitter_creator: checkQuery.twitter_creator || '',
      new_twitter_creator: body.twitter_creator === checkQuery.twitter_creator ? '' : body.twitter_creator,
      user_type: auth.message.user_type === 1 ? 'user' : 'admin',
      updated_by: auth.message.user_type === 1 ? auth.message.user_row_id : (auth.message.user_row_id ?? 0),
    })
  }

  await ProfessionalSeoDetailsM.updateOne({ user_row_id: Number(body.module_id) }, updateData)
  await calculateUserProfileScore(body.module_id, ['professional_profile'])
  await invalidateAfterSeoUpdate()

  return { status: true, message: { alert_message: 'User SEO meta details updated successfully' } }
}

// FLAGGED, NOT FIXED (real, confirmed access-control gap): unlike /update_user_seo, this route
// applies NO ownership restriction — `condition._id` is always the raw `:user_row_id` param
// regardless of the caller's own identity, so any authenticated professional (not just admins)
// can fetch ANY other professional's full aggregated record (SEO fields, socials, work
// experience, email) via this endpoint, not just their own. Ported as-is: tightening this would
// be a real access-control behavior change needing explicit sign-off, not a silent migration fix.
export async function getUserSeo(auth: UserAuthResult, userRowIdRaw: string) {
  if (!userRowIdRaw) {
    return { status: false, message: { alert_message: 'The User Row ID field is required.' } }
  }
  if (!auth.status) return auth

  const userData = await getUserSeoAggregate(Number(userRowIdRaw))
  if (!userData || userData.length === 0) {
    return { status: false, message: { alert_message: 'Invalid User Row ID.' } }
  }

  return { status: true, message: { alert_message: 'User SEO fetched successfully' }, data: userData[0] }
}
