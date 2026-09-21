// modules/professionals/professionals.self-service.service.ts
// Ports controllers/app/users/setting.js's POST /update_user_details (~45-445) — the backend
// behind the main "edit my profile" self-service form (confirmed: the `location_country` field
// in this route's response matches the plan's earlier field-level diff findings for CreateUser.tsx).
// Same behavior, same response shape, same validation quirks — no new behavior.
import sanitize from 'mongo-sanitize'
import { ProfessionalM, ProfessionalSeoDetailsM, ProfessionalSocialLinksM } from './professionals.models'
import type { UpdateUserDetailsBody, UserAuthResult, UserTokenAuthResult } from './professionals.self-service.types'
import { getUsersProfessionalDetails, getUserIndividualDetails, getUserSuggestionDetails, getCompanySuggestions } from '../../../services/app/settings'
import { submitChangeRequest } from '../../modules/change-request/change-request.service'
import { findPendingRequest } from '../../modules/change-request/change-request.queries'
import { buildOverlayPayload } from '../../modules/change-request/change-request.diff'
import { SECTION_PROFESSIONAL_BASIC_DETAILS, SECTION_PROFESSIONAL_SOCIAL_MEDIA } from '../../modules/change-request/change-request.registry'
import { AUDIT_MODULE_PROFESSIONALS } from '../../common/status-audit/status-audit.registry'
import { toActorRefWithId } from '../../common/status-audit/status-audit.actor'
import { insertChangeLog } from '../../common/status-audit/status-audit.queries'
import logger from '../../../config/logger'

const ADMIN_ROW_ID_MAIN_ADMIN = 0

const DomainsBlockedM = require('../../../models/system_settings/domains_blockedM')
const ProfessionalsManualRetrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const ProfessionalsPointsM = require('../../../models/app/users/professionals_pointsM')
const ProfessionalsFollowersM = require('../../../models/app/professionals_followersM')
const SeoChangeLogsM = require('../../../models/seo_change_logsM')
const VerifyEmailM = require('../../../models/app/auth_account/verify_emailM')
const VerifyMobileNumberM = require('../../../models/app/auth_account/verify_mobile_numberM')
const CompanyM = require('../../../models/app/company/companyM')
const CompanyManualRetrievalsM = require('../../../models/app/company/company_manual_retrievalsM')
const PushNotificationsDetailsM = require('../../../models/app/notifications/push_notifications_detailsM')
// Owned by the `work-experience` module per the plan's model-to-module mapping — required
// directly here (not colocated) since `public_status_list` is part of this setting.js sweep,
// matching precedent already in this file (ProfessionalsPointsM, ProfessionalsFollowersM, etc.).
const ProfessionalsWorkExperienceM = require('../../../models/app/professionals_work_experienceM')
const randomstring = require('randomstring')
const { getPresentDateTime, getIntIdFromArray, removeHtmltag } = require('../../../utils/helpers/helper')
const { getUpdateTrackerFields, calculateUserProfileScore } = require('../../../utils/helpers/app_helper')
const { shiftUserFromManualToRegister } = require('../../../utils/helpers/events_helper')
const { updateThreadNotification } = require('../../../utils/helpers/notification_helper')
const { sendEmail } = require('../../../config/email')
const { deleteKeysByPattern } = require('@ultimez-interview/coinpedia-backend-library/cache')

const PROFILE_SCORE_FIELDS = {
  professional_profile_score: 1, seo_details_score: 1, social_media_score: 1, academy_score: 1,
  community_score: 1, professional_detail_score: 1, investment_score: 1, award_score: 1,
  faq_score: 1, profile_score: 1,
} as const

const SEO_META_DESCRIPTION_MAX_LENGTH = 160

function hasChanged(oldVal: unknown, newVal: unknown): boolean {
  const oldTrimmed = String(oldVal ?? '').trim()
  const newTrimmed = String(newVal ?? '').trim()
  return newTrimmed !== '' && oldTrimmed !== newTrimmed
}

interface ApplyProfessionalBasicDetailsSideEffectsParams {
  action: 'create' | 'update'
  userRowId: number
  payload: Record<string, unknown>
  actor: { type: string | null; id: number | null }
}

/**
 * Publish-time counterpart to `updateUserDetails`'s own inline SEO-seeding tail below (lines
 * ~218-295) - called by change-request.apply.ts once a `professional_basic_details` change is
 * published, so an admin-reviewed edit gets the same SEO/score-recalculation side effects a direct
 * (self-service or admin-panel-without-review) write already gets. Mirrors Company's own
 * applyBasicDetailsSideEffects (company.settings.service.ts) - same "best-effort, doesn't roll
 * back the already-committed row write" convention as every other publish side effect.
 *
 * Deliberately narrower than the direct-write tail it mirrors: `youtube_channel`/`website` aren't
 * part of `professional_basic_details`'s own editable-field whitelist (they belong to the
 * `professional_social_media` section instead), so social-link seeding is left to that section's
 * own publish path rather than duplicated here from a payload that will never carry them.
 */
export async function applyProfessionalBasicDetailsSideEffects({ action, userRowId, payload, actor }: ApplyProfessionalBasicDetailsSideEffectsParams): Promise<void> {
  const fullName = typeof payload.full_name === 'string' ? payload.full_name : undefined
  const userBio = typeof payload.user_bio === 'string' ? payload.user_bio : undefined

  const checkQuery: any = await ProfessionalSeoDetailsM.findOne(
    { user_row_id: userRowId },
    { _id: 1, meta_keywords: 1, meta_description: 1, meta_title: 1, og_title: 1, og_description: 1, twitter_title: 1, twitter_description: 1 },
  )

  const seoUpdateArray: Record<string, unknown> = {}

  if (userBio) {
    if (!checkQuery?.meta_description) {
      const cleanedBio = removeHtmltag(userBio).slice(0, SEO_META_DESCRIPTION_MAX_LENGTH)
      seoUpdateArray.meta_description = cleanedBio
      seoUpdateArray.og_description = cleanedBio
      seoUpdateArray.twitter_description = cleanedBio
    } else if (!checkQuery.og_description) {
      seoUpdateArray.og_description = checkQuery?.meta_description
      seoUpdateArray.twitter_description = checkQuery?.meta_description
    }
  }

  if (fullName) {
    const title = `${fullName} | Coinpedia User Profile`
    if (!checkQuery?.meta_title) {
      seoUpdateArray.meta_title = title
      seoUpdateArray.og_title = title
      seoUpdateArray.twitter_title = title
    } else if (!checkQuery.og_title) {
      seoUpdateArray.og_title = checkQuery?.meta_title
      seoUpdateArray.twitter_title = checkQuery?.meta_title
    }
    if (!checkQuery?.meta_keywords) seoUpdateArray.meta_keywords = fullName
  }

  const changed =
    hasChanged(checkQuery?.meta_description, seoUpdateArray.meta_description) ||
    hasChanged(checkQuery?.og_description, seoUpdateArray.og_description) ||
    hasChanged(checkQuery?.twitter_description, seoUpdateArray.twitter_description) ||
    hasChanged(checkQuery?.meta_keywords, seoUpdateArray.meta_keywords) ||
    hasChanged(checkQuery?.meta_title, seoUpdateArray.meta_title) ||
    hasChanged(checkQuery?.og_title, seoUpdateArray.og_title) ||
    hasChanged(checkQuery?.twitter_title, seoUpdateArray.twitter_title)

  if (changed) {
    await SeoChangeLogsM.create({
      module_key: 'professional',
      module_id: userRowId,
      old_meta_title: checkQuery?.meta_title || '',
      new_meta_title: hasChanged(checkQuery?.meta_title, seoUpdateArray.meta_title) ? seoUpdateArray.meta_title : '',
      old_meta_description: checkQuery?.meta_description || '',
      new_meta_description: hasChanged(checkQuery?.meta_description, seoUpdateArray.meta_description) ? seoUpdateArray.meta_description : '',
      old_meta_keywords: checkQuery?.meta_keywords || '',
      new_meta_keywords: hasChanged(checkQuery?.meta_keywords, seoUpdateArray.meta_keywords) ? seoUpdateArray.meta_keywords : '',
      old_og_title: checkQuery?.og_title || '',
      new_og_title: hasChanged(checkQuery?.og_title, seoUpdateArray.og_title) ? seoUpdateArray.og_title : '',
      old_og_description: checkQuery?.og_description || '',
      new_og_description: hasChanged(checkQuery?.og_description, seoUpdateArray.og_description) ? seoUpdateArray.og_description : '',
      old_twitter_title: checkQuery?.twitter_title || '',
      new_twitter_title: hasChanged(checkQuery?.twitter_title, seoUpdateArray.twitter_title) ? seoUpdateArray.twitter_title : '',
      old_twitter_description: checkQuery?.twitter_description || '',
      new_twitter_description: hasChanged(checkQuery?.twitter_description, seoUpdateArray.twitter_description) ? seoUpdateArray.twitter_description : '',
      user_type: actor.type === 'user' ? 'user' : 'admin',
      updated_by: actor.id ?? 0,
    })
  }

  if (Object.keys(seoUpdateArray).length > 0 || action === 'create') {
    await ProfessionalSeoDetailsM.findOneAndUpdate({ user_row_id: userRowId }, { $set: seoUpdateArray }, { upsert: true })
  }

  await Promise.all([
    deleteKeysByPattern('user_detail*'),
    deleteKeysByPattern('app_user_detail_*'),
    deleteKeysByPattern('app_popular_professionals*'),
    deleteKeysByPattern('individual_event_*'),
    deleteKeysByPattern('app_company_individual_details_*'),
    deleteKeysByPattern('speakers_list_*'),
  ])
  await calculateUserProfileScore(userRowId, ['professional_profile'])
}

export async function updateUserDetails(auth: UserAuthResult, body: UpdateUserDetailsBody, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = { ...preValidationErrors }
  let userRowId = 0
  let mobileNumber = ''
  let userName = ''
  let emailId = ''
  let subAdminRowId = 0

  if (auth.message.user_type === 1) {
    userRowId = auth.message.user_row_id
  } else {
    subAdminRowId = auth.message.user_row_id

    if (body.user_row_id) {
      const parsed = Number.parseInt(body.user_row_id as string)
      if (!Number.isNaN(parsed)) {
        userRowId = parsed
      } else {
        const checkUserQuery = await ProfessionalM.findOne({ _id: userRowId }, { _id: 1 })
        if (!checkUserQuery) errObj['alert_message'] = 'Sorry, Invalid User Row ID.'
      }
    }

    if (body.mobile_number) {
      if (/[^0-9\-()\s]/.test(body.mobile_number)) {
        errObj['mobile_number'] = 'The Mobile Number field cannot have speacial charaters.'
      }
      const checkMobileNumQuery = await ProfessionalM.findOne({ $and: [{ _id: { $ne: sanitize(userRowId) } }, { mobile_number: sanitize(body.mobile_number) }] })
      if (checkMobileNumQuery) errObj['mobile_number'] = 'This Mobile number is already in use.'
      mobileNumber = body.mobile_number
    }

    if (body.user_name) {
      userName = sanitize(body.user_name).toLowerCase()
      const checkQuery = await ProfessionalM.findOne({ $and: [{ _id: { $ne: sanitize(userRowId) } }, { user_name: userName }] })
      if (checkQuery) errObj['user_name'] = 'This username is already in use.'
    } else {
      errObj['user_name'] = 'The username field is required.'
    }

    if (body.email_id) {
      emailId = sanitize(body.email_id).toLowerCase()
      const checkEmailQuery = await ProfessionalM.findOne({ email_id: emailId, _id: { $ne: sanitize(userRowId) } })
      if (checkEmailQuery) errObj['email_id'] = 'Sorry, This Email ID already exists.'

      const domainName = emailId.split('@').slice(-1)
      const checkDomainQuery = await DomainsBlockedM.findOne({ domain_name: domainName })
      if (checkDomainQuery) errObj['email_id'] = 'Sorry, This Email ID is not permitted.'
    }
  }

  if (/[^A-Za-z0-9 ]/.test(body.full_name)) {
    errObj['full_name'] = 'The Full Name field may only contain alpha-numeric characters and spaces.'
  }

  let lookingForId: number[] = []
  if (body.looking_for_id && (body.looking_for_id as unknown[]).length > 0) {
    const lookingForIdArray = await getIntIdFromArray(body.looking_for_id)
    if (lookingForIdArray.length > 0) lookingForId = lookingForIdArray
    else errObj['looking_for_id'] = 'The looking for Ids field must be integer in object'
  }

  let designationId: number[] = []
  if (body.designation_id && (body.designation_id as unknown[]).length > 0) {
    const designationIdArray = await getIntIdFromArray(body.designation_id)
    if (designationIdArray.length > 0) designationId = designationIdArray
    else errObj['designation_id'] = 'The Designation Ids field must be integer in object'
  }

  if (body.vcf_status && Number.isNaN(Number.parseInt(body.vcf_status as string))) {
    errObj['vcf_status'] = 'The VCF Status field must be integer.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const mainArray: Record<string, unknown> = {
    gender: body.gender,
    full_name: body.full_name,
    account_visible_type: body.account_visible_type,
    designation_id: designationId,
    updated_date_n_time: getPresentDateTime(),
    about_in_one_line: body.about_in_one_line,
    country_id: body.country_id,
    country_mobile_id: body.country_mobile_id,
    location: body.location,
    looking_for_id: lookingForId,
    user_bio: body.user_bio,
    vcf_status: body.vcf_status ? Number.parseInt(body.vcf_status as string) : 0,
    area: body.area,
    city: body.city,
    country_name: body.country_name,
    location_country: body.location_country,
    state: body.state,
    longitude: body.longitude,
    latitude: body.latitude,
  }

  if (auth.message.user_type === 2) {
    mainArray['mobile_number'] = mobileNumber ? body.mobile_number : ''
    mainArray['user_name'] = userName ? body.user_name : ''
    mainArray['email_id'] = emailId ? body.email_id : ''
  }

  let alertMessage = ''
  let insertedFullName = ''

  if (userRowId) {
    // Publish gate applies to admin-panel edits only (design §2, same shape as Company's own
    // updateCompanyBasicDetails) — a professional editing their own profile keeps writing live
    // immediately, exactly as before. Only EDITS go through the gate; a brand-new professional
    // (the `else` branch below) always saves live, matching Company's own reverted decision on
    // create (no view page yet to review/publish a pending creation against).
    if (auth.message.user_type === 2) {
      const liveValues = (await ProfessionalM.findOne({ _id: userRowId }).lean()) ?? {}
      const adminRowId = subAdminRowId
      return submitChangeRequest({
        module: AUDIT_MODULE_PROFESSIONALS,
        section: SECTION_PROFESSIONAL_BASIC_DETAILS,
        rootDocumentId: userRowId,
        targetRowId: null,
        liveValues,
        submitted: mainArray,
        actor: toActorRefWithId(
          {
            updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
            updated_by_row_id: adminRowId,
          },
          adminRowId,
        ),
      })
    }

    const updateFields = getUpdateTrackerFields(auth)
    Object.assign(mainArray, updateFields)

    await ProfessionalM.updateOne({ _id: userRowId }, { $set: mainArray })
    await Promise.all([
      deleteKeysByPattern('professional_detail_list_*'),
      deleteKeysByPattern('speakers_list_*'),
      deleteKeysByPattern('individual_event_*'),
      deleteKeysByPattern('app_company_individual_details_*'),
      deleteKeysByPattern('user_detail*'),
      deleteKeysByPattern('app_user_detail_*'),
      deleteKeysByPattern('app_popular_professionals*'),
    ])

    alertMessage = 'Great! Your profile details have been updated successfully. Thank you for making the necessary changes'
  } else {
    const dateNTime = getPresentDateTime()
    mainArray['created_date_n_time'] = dateNTime
    mainArray['sub_admin_row_id'] = subAdminRowId
    mainArray['claim_status'] = 1
    delete mainArray['updated_date_n_time']

    const insertedQuery: any = await new ProfessionalM(mainArray).save()
    await Promise.all([
      deleteKeysByPattern('speakers_list_*'),
      deleteKeysByPattern('individual_event_*'),
      deleteKeysByPattern('app_company_individual_details_*'),
      deleteKeysByPattern('user_detail*'),
      deleteKeysByPattern('app_user_detail_*'),
      deleteKeysByPattern('app_popular_professionals*'),
    ])
    userRowId = insertedQuery._id
    insertedFullName = insertedQuery.full_name

    // CONFIRMED GAP FIX (user-requested, 2026-09-20, "creation of professionals and company
    // profile must be registered in the change log/history"): professional creation was never
    // audited at all, unlike Company's own equivalent (already fixed) - the History tab only ever
    // showed later edits, never who actually created the professional or when. `section:
    // 'creation'` matches Company's own literal section name for a whole-entity creation entry.
    const creationTrackerFields = getUpdateTrackerFields(auth)
    try {
      await insertChangeLog({
        module: AUDIT_MODULE_PROFESSIONALS,
        target_collection: 'cln_professionals',
        target_row_id: userRowId,
        root_document_id: userRowId,
        section: 'creation',
        action: 'create',
        actor: toActorRefWithId(creationTrackerFields, creationTrackerFields.updated_by_row_id ?? subAdminRowId),
        changes: [{ field: 'name', field_label: 'Name', old_value: null, old_label: null, new_value: insertedFullName, new_label: null }],
        reason: null,
        snapshot: null,
      })
    } catch (err) {
      logger.error({ err, user_row_id: userRowId }, 'professionals.self-service: creation change log write failed')
    }

    const manualUserRowId = Number.parseInt(body.manual_user_row_id as string)
    if (!Number.isNaN(manualUserRowId)) {
      const checkManualQuery = await ProfessionalsManualRetrievalsM.findOne({ _id: manualUserRowId })
      if (checkManualQuery) {
        await shiftUserFromManualToRegister({ manual_user_row_id: manualUserRowId, register_user_row_id: userRowId, sub_admin_row_id: subAdminRowId })
      }
    }

    const passSubject = ' Coinpedia Has Listed Your User Profile. ! Claim This User Profile Now '
    const passMessage = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${insertedFullName},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We are writing to inform you that your user profile has been listed on Coinpedia. You can claim this profile page to unlock unlimited features and enhance your online presence.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
                    <ul>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
                    </ul>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Get started with the user profile today, by submitting a claim request to our admin. Our admin will review and notify you via email. Upon admin’s approval, you get access to all the features. </p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login here</a> </p>`
    await sendEmail(emailId, passSubject, passMessage)
    alertMessage = 'New user successfully created.'
  }

  const socialUpdateArray = { youtube_channel: body.youtube_channel ? body.youtube_channel.trim() : '', website: body.website }

  const checkQuery: any = await ProfessionalSeoDetailsM.findOne(
    { user_row_id: userRowId },
    { _id: 1, meta_keywords: 1, meta_description: 1, meta_title: 1, robots_index: 1, robots_follow: 1, og_title: 1, og_description: 1, twitter_title: 1, twitter_description: 1, twitter_creator: 1 },
  )

  const seoUpdateArray: Record<string, unknown> = {}

  if (body.user_bio) {
    if (!checkQuery?.meta_description) {
      const cleanedBio = removeHtmltag(body.user_bio).slice(0, SEO_META_DESCRIPTION_MAX_LENGTH)
      seoUpdateArray.meta_description = cleanedBio
      seoUpdateArray.og_description = cleanedBio
      seoUpdateArray.twitter_description = cleanedBio
    } else if (!checkQuery.og_description) {
      seoUpdateArray.og_description = checkQuery?.meta_description
      seoUpdateArray.twitter_description = checkQuery?.meta_description
    }
  }

  if (body.full_name) {
    const title = `${body.full_name} | Coinpedia User Profile`
    if (!checkQuery?.meta_title) {
      seoUpdateArray.meta_title = title
      seoUpdateArray.og_title = title
      seoUpdateArray.twitter_title = title
    } else if (!checkQuery.og_title) {
      seoUpdateArray.og_title = checkQuery?.meta_title
      seoUpdateArray.twitter_title = checkQuery?.meta_title
    }
    if (!checkQuery?.meta_keywords) seoUpdateArray.meta_keywords = body.full_name
  }

  const changed =
    hasChanged(checkQuery?.meta_description, seoUpdateArray.meta_description) ||
    hasChanged(checkQuery?.og_description, seoUpdateArray.og_description) ||
    hasChanged(checkQuery?.twitter_description, seoUpdateArray.twitter_description) ||
    hasChanged(checkQuery?.meta_keywords, seoUpdateArray.meta_keywords) ||
    hasChanged(checkQuery?.meta_title, seoUpdateArray.meta_title) ||
    hasChanged(checkQuery?.og_title, seoUpdateArray.og_title) ||
    hasChanged(checkQuery?.twitter_title, seoUpdateArray.twitter_title)

  if (changed) {
    await SeoChangeLogsM.create({
      module_key: 'professional',
      module_id: userRowId,
      old_meta_title: checkQuery?.meta_title || '',
      new_meta_title: hasChanged(checkQuery?.meta_title, seoUpdateArray.meta_title) ? seoUpdateArray.meta_title : '',
      old_meta_description: checkQuery?.meta_description || '',
      new_meta_description: hasChanged(checkQuery?.meta_description, seoUpdateArray.meta_description) ? seoUpdateArray.meta_description : '',
      old_meta_keywords: checkQuery?.meta_keywords || '',
      new_meta_keywords: hasChanged(checkQuery?.meta_keywords, seoUpdateArray.meta_keywords) ? seoUpdateArray.meta_keywords : '',
      old_og_title: checkQuery?.og_title || '',
      new_og_title: hasChanged(checkQuery?.og_title, seoUpdateArray.og_title) ? seoUpdateArray.og_title : '',
      old_og_description: checkQuery?.og_description || '',
      new_og_description: hasChanged(checkQuery?.og_description, seoUpdateArray.og_description) ? seoUpdateArray.og_description : '',
      old_twitter_title: checkQuery?.twitter_title || '',
      new_twitter_title: hasChanged(checkQuery?.twitter_title, seoUpdateArray.twitter_title) ? seoUpdateArray.twitter_title : '',
      old_twitter_description: checkQuery?.twitter_description || '',
      new_twitter_description: hasChanged(checkQuery?.twitter_description, seoUpdateArray.twitter_description) ? seoUpdateArray.twitter_description : '',
      user_type: auth.message.user_type === 1 ? 'user' : 'admin',
      updated_by: auth.message.user_type === 1 ? userRowId : subAdminRowId,
    })
  }

  await ProfessionalSeoDetailsM.findOneAndUpdate({ user_row_id: userRowId }, { $set: seoUpdateArray }, { upsert: true })
  await ProfessionalSocialLinksM.findOneAndUpdate({ user_row_id: userRowId }, { $set: socialUpdateArray }, { upsert: true })

  await Promise.all([
    deleteKeysByPattern('user_detail*'),
    deleteKeysByPattern('app_user_detail_*'),
    deleteKeysByPattern('app_popular_professionals*'),
    deleteKeysByPattern('individual_event_*'),
    deleteKeysByPattern('app_company_individual_details_*'),
    deleteKeysByPattern('speakers_list_*'),
  ])
  await calculateUserProfileScore(userRowId, ['professional_profile'])

  return { status: true, message: { user_row_id: userRowId, alert_message: alertMessage, location_country: body.location_country } }
}

// Ports controllers/app/users/setting.js's GET /profile_score (~446-554). Access id `[0]`
// preserved exactly (not normalized) — see professionals-followers.service.ts's doc comment for
// why access ids are treated as distinct granted-permission flags, not a security hierarchy.
export async function getProfileScore(auth: UserAuthResult, queryUserRowIdRaw: unknown, showScoreRaw: unknown) {
  if (!auth.status) return { httpStatus: 200, body: { status: true, message: { alert_message: auth.message } } }

  let userRowId = 0
  if (auth.message.user_type === 1) {
    userRowId = auth.message.user_row_id
  } else if (queryUserRowIdRaw) {
    const parsed = Number.parseInt(queryUserRowIdRaw as string)
    if (!Number.isNaN(parsed)) userRowId = parsed
  }

  const userMain: any = await ProfessionalM.findOne({ _id: userRowId }, PROFILE_SCORE_FIELDS)
  if (!userMain) {
    return { httpStatus: 404, body: { status: false, message: 'User not found.' } }
  }

  let totalBalance: any[] | undefined
  if (showScoreRaw) {
    totalBalance = await ProfessionalsPointsM.aggregate([
      { $match: { user_row_id: userRowId } },
      { $addFields: { numeric_points: { $toDouble: '$points' } } },
      {
        $group: {
          _id: null,
          total_credited: { $sum: { $cond: [{ $eq: ['$point_status', 'credited'] }, '$numeric_points', 0] } },
          total_debited: { $sum: { $cond: [{ $eq: ['$point_status', 'debited'] }, '$numeric_points', 0] } },
        },
      },
      { $project: { _id: 0, total_balance: { $subtract: ['$total_credited', '$total_debited'] } } },
    ])
  }

  const balance = showScoreRaw ? totalBalance?.[0]?.total_balance || 0 : null

  return {
    httpStatus: 200,
    body: {
      status: true,
      message: {
        basic_details: userMain.professional_profile_score,
        seo_details: userMain.seo_details_score,
        social_media: userMain.social_media_score,
        academy: userMain.academy_score,
        community: userMain.community_score,
        work_experience: userMain.professional_detail_score,
        investments: userMain.investment_score,
        awards: userMain.award_score,
        faqs: userMain.faq_score,
        total_score: userMain.profile_score,
        points: balance,
      },
    },
  }
}

// Ports controllers/app/users/setting.js's GET /all_users_profile_scores/:skip/:limit
// (~557-634). CONFIRMED PERF FIX (real N+1, not hypothetical): legacy fetches a page of
// professionals with only `{_id, full_name, email_id, pro_batch}` projected, then re-fetches EACH
// one individually inside a `for` loop just to get the score fields — up to `limit` (default 100)
// extra round trips per request. Fixed by requesting every needed field in the single paginated
// find, dropping the loop entirely. Same output shape, same data, one query instead of 1+N.
export async function getAllUsersProfileScores(auth: UserAuthResult, skipRaw: string, limitRaw: string) {
  if (!auth.status) return { status: false, message: { alert_message: auth.message } }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 100

  const users: any[] = await ProfessionalM.find({}, { _id: 1, full_name: 1, email_id: 1, pro_batch: 1, ...PROFILE_SCORE_FIELDS }).skip(skip).limit(limit)

  const results = users.map((user) => ({
    _id: user._id,
    full_name: user.full_name,
    pro_batch: user.pro_batch,
    email_id: user.email_id,
    profile_score: {
      basic_details: user.professional_profile_score,
      seo_details: user.seo_details_score,
      social_media: user.social_media_score,
      faq: user.faq_score,
      awards: user.award_score,
      work_experience: user.professional_detail_score,
      investments: user.investment_score,
      total_score_percentage: user.profile_score,
      academy_score: user.academy_score,
      community_score: user.community_score,
    },
  }))

  return { status: true, message: 'Live profile scores fetched successfully', data: results, skip, limit }
}

// Ports controllers/app/users/setting.js's POST /update_user_details_api (~640-853) — a
// no-login-token (`checkApiKey`-only) variant of /update_user_details, with no cache invalidation
// and no profile-score recalculation (legacy never calls either here).
//
// FLAGGED, NOT FIXED (real, confirmed bug — this route cannot ever return success today):
// legacy's final success response references `check_location_query`, a variable that is NEVER
// declared anywhere in this route — a `ReferenceError` on every single successful update/create,
// caught by the outer try/catch and turned into the generic "unexpected error" response. Every
// real call to this route today experiences this. Ported as-is: "fixing" it would make this route
// start actually succeeding for the first time, a major behavior change needing sign-off first.
export async function updateUserDetailsApi(body: UpdateUserDetailsBody, preValidationErrors: Record<string, unknown>): Promise<{ status: boolean; message: unknown }> {
  const errObj: Record<string, unknown> = { ...preValidationErrors }
  let userRowId = 0
  let emailId = ''

  const hasSocialField = !!(body.feed_url || body.facebook || body.twitter || body.linkedin || body.youtube_channel || body.video_link || body.instagram || body.telegram || body.reddit || body.medium)
  if (!hasSocialField) errObj['alert_message'] = 'Please submit atleast one social media details.'

  if (body.user_row_id) {
    const parsed = Number.parseInt(body.user_row_id as string)
    if (!Number.isNaN(parsed)) {
      userRowId = parsed
    } else {
      const checkUserQuery = await ProfessionalM.findOne({ _id: userRowId }, { _id: 1 })
      if (!checkUserQuery) errObj['alert_message'] = 'Sorry, Invalid User Row ID.'
    }

    if (body.mobile_number) {
      if (/[^0-9\-()\s]/.test(body.mobile_number)) errObj['mobile_number'] = 'The Mobile Number field cannot have speacial charaters.'
      const checkMobileNumQuery = await ProfessionalM.findOne({ $and: [{ _id: { $ne: sanitize(userRowId) } }, { mobile_number: sanitize(body.mobile_number) }] })
      if (checkMobileNumQuery) errObj['mobile_number'] = 'This Mobile number is already in use.'
    }

    if (body.user_name) {
      const userName = sanitize(body.user_name).toLowerCase()
      const checkQuery = await ProfessionalM.findOne({ $and: [{ _id: { $ne: sanitize(userRowId) } }, { user_name: userName }] })
      if (checkQuery) errObj['user_name'] = 'This username is already in use.'
    } else {
      errObj['user_name'] = 'The username field is required.'
    }

    if (body.email_id) {
      emailId = sanitize(body.email_id).toLowerCase()
      const checkEmailQuery = await ProfessionalM.findOne({ email_id: emailId, _id: { $ne: sanitize(userRowId) } })
      if (checkEmailQuery) errObj['email_id'] = 'Sorry, This Email ID already exists.'
      const domainName = emailId.split('@').slice(-1)
      const checkDomainQuery = await DomainsBlockedM.findOne({ domain_name: domainName })
      if (checkDomainQuery) errObj['email_id'] = 'Sorry, This Email ID is not permitted.'
    }
  }

  if (/[^A-Za-z0-9 ]/.test(body.full_name)) errObj['full_name'] = 'The Full Name field may only contain alpha-numeric characters and spaces.'

  let lookingForId: number[] = []
  if (body.looking_for_id && (body.looking_for_id as unknown[]).length > 0) {
    const arr = await getIntIdFromArray(body.looking_for_id)
    if (arr.length > 0) lookingForId = arr
    else errObj['looking_for_id'] = 'The looking for Ids field must be integer in object'
  }

  let designationId: number[] = []
  if (body.designation_id && (body.designation_id as unknown[]).length > 0) {
    const arr = await getIntIdFromArray(body.designation_id)
    if (arr.length > 0) designationId = arr
    else errObj['designation_id'] = 'The Designation Ids field must be integer in object'
  }

  if (body.vcf_status && Number.isNaN(Number.parseInt(body.vcf_status as string))) errObj['vcf_status'] = 'The VCF Status field must be integer.'

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const mainArray: Record<string, unknown> = {
    gender: body.gender, full_name: body.full_name, account_visible_type: body.account_visible_type,
    designation_id: designationId, updated_date_n_time: getPresentDateTime(), about_in_one_line: body.about_in_one_line,
    country_id: body.country_id, country_mobile_id: body.country_mobile_id, location: body.location,
    looking_for_id: lookingForId, user_bio: body.user_bio, vcf_status: body.vcf_status ? Number.parseInt(body.vcf_status as string) : 0,
    area: body.area, city: body.city, country_name: body.country_name, state: body.state, longitude: body.longitude, latitude: body.latitude,
  }

  let alertMessage = ''
  if (userRowId) {
    await ProfessionalM.updateOne({ _id: userRowId }, { $set: mainArray })
    alertMessage = 'Great! Your profile details have been updated successfully. Thank you for making the necessary changes'
  } else {
    const dateNTime = getPresentDateTime()
    mainArray['created_date_n_time'] = dateNTime
    mainArray['updated_date_n_time'] = dateNTime
    mainArray['sub_admin_row_id'] = 0
    mainArray['claim_status'] = 1
    const insertedQuery: any = await new ProfessionalM(mainArray).save()
    userRowId = insertedQuery._id

    const manualUserRowId = Number.parseInt(body.manual_user_row_id as string)
    if (!Number.isNaN(manualUserRowId)) {
      const checkManualQuery = await ProfessionalsManualRetrievalsM.findOne({ _id: manualUserRowId })
      if (checkManualQuery) await shiftUserFromManualToRegister({ manual_user_row_id: manualUserRowId, register_user_row_id: userRowId, sub_admin_row_id: 0 })
    }

    const passSubject = ' Coinpedia Has Listed Your User Profile. ! Claim This User Profile Now '
    const passMessage = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${insertedQuery.full_name},</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">We are writing to inform you that your user profile has been listed on Coinpedia. You can claim this profile page to unlock unlimited features and enhance your online presence.</p>
                    <p style="color:#000;font-weight: 400;font-size:17px;">As a user of CoinPedia, you will have access to a range of exciting features, including:</p>
                    <ul>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Portfolio Account: </b> With your account, you can manage multiple portfolio wallets accounts effortlessly.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>CoinPedia Academy: </b>Take advantage of our free online tutorials and learn Blockchain and Fintech from scratch. Pass the quiz and claim authorized certificates.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Social Network of Crypto: </b>Join our Blockchain social networking platform to post trading quotes, share ideas, and connect with people who share your interests.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Create Company Profile: </b> Create your company profile page to showcase your team members, post job openings, share company-related news, and much more. </p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Manage Events: </b>Create events, follow speakers, organizers, and register for events effortlessly with our user-friendly platform. Stay informed about upcoming events and expand your network within your industry.</p></li>
                      <li><p style="color:#000;font-weight: 400;font-size:17px;"><b>Coinpedia News: </b>Stay updated with the latest news happening in the crypto and fintech from Coinpedia. We bring you the most recent news taking place in these industries.</p></li>
                    </ul>
                    <p style="color:#000;font-weight: 400;font-size:17px;">Get started with the user profile today, by submitting a claim request to our admin. Our admin will review and notify you via email. Upon admin’s approval, you get access to all the features. </p>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><a href="https://app.coinpedia.org/login/" style="color:#0029ff;">Login here</a> </p>`
    await sendEmail(emailId, passSubject, passMessage)
    alertMessage = 'New user successfully created.'
  }

  const seoUpdateArray = { meta_keywords: body.meta_keywords, meta_description: body.meta_description, user_row_id: userRowId }
  await ProfessionalSeoDetailsM.findOneAndUpdate({ user_row_id: userRowId }, { $set: seoUpdateArray }, { upsert: true })

  const socialUpdateArray = { youtube_channel: body.youtube_channel ? body.youtube_channel.trim() : '', website: body.website, user_row_id: userRowId }
  await ProfessionalSocialLinksM.findOneAndUpdate({ user_row_id: userRowId }, { $set: socialUpdateArray }, { upsert: true })

  // TypeScript can't compile a reference to a truly undeclared identifier the way legacy JS
  // could — thrown explicitly instead, to reproduce the exact same observable outcome (falls into
  // the controller's catch, returns the generic error response) without an undefined variable.
  throw new ReferenceError('check_location_query is not defined')
}

// Ports controllers/app/users/setting.js's GET /users_professional_details (~920-944) — already a
// thin wrapper around services/app/settings.ts's getUsersProfessionalDetails (already TS, already
// using the structured logger) — reused as-is, not reimplemented.
export async function getUsersProfessionalDetailsResponse() {
  const result = await getUsersProfessionalDetails()
  if (result.status) {
    return { status: true, message: result.message, cache_response_status: (result as any).cache_response_status }
  }
  return { status: false, message: result.message }
}

// Ports controllers/app/users/setting.js's GET /user_individual_details (~1007-1039) — already a
// thin wrapper around services/app/settings.ts's getUserIndividualDetails (already TS) — reused
// as-is, not reimplemented.
export async function getUserIndividualDetailsResponse(auth: UserAuthResult, queryUserRowIdRaw: unknown, includePendingOverlay?: boolean) {
  if (!auth.status) return { status: false, message: { alert_message: auth.message } }

  let userRowId: number | undefined
  if (auth.message.user_type === 1) {
    userRowId = auth.message.user_row_id
  } else if (queryUserRowIdRaw) {
    const parsed = Number.parseInt(queryUserRowIdRaw as string)
    if (!Number.isNaN(parsed)) userRowId = parsed
  }

  if (!userRowId || userRowId <= 0) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User Row ID.' } }
  }

  const result = await getUserIndividualDetails(userRowId)

  // CONFIRMED BUG FIX (user-requested, 2026-09-20, "I previously updated the basic details...
  // approved it, then again updated the profile visibility only but it is showing all the
  // previous... change as pending"): mirrors company.settings.service.ts's own
  // `includePendingOverlay` fix exactly - this route had NO equivalent at all. Without it, the
  // admin edit form hydrates from LIVE data even when a change to this professional was already
  // approved but not yet published - and since the form always resubmits its ENTIRE current
  // state, every field from that earlier approved-but-unpublished edit gets re-diffed against the
  // (now-updated-in-the-pending-payload) baseline, looks "changed back" to computeDiff, and gets
  // merged back into the request with its status reset to 'pending' - even though the admin only
  // touched one unrelated field this time. Opt-in only (never set by the read-only View page, same
  // rationale as Company's own gate) so a reviewer never sees an approved-but-unpublished value
  // presented as if it were already live.
  if (includePendingOverlay && auth.message.user_type === 2 && result?.status) {
    await overlayPendingProfessionalSectionPayloads(result.message as Record<string, unknown>, userRowId)
  }

  return result
}

/** See getUserIndividualDetailsResponse's own comment on why this overlay exists. */
async function overlayPendingProfessionalSectionPayloads(details: Record<string, unknown>, userRowId: number): Promise<void> {
  const [pendingBasicDetails, pendingSocialMedia] = await Promise.all([
    findPendingRequest({ module: AUDIT_MODULE_PROFESSIONALS, rootDocumentId: userRowId, section: SECTION_PROFESSIONAL_BASIC_DETAILS }),
    findPendingRequest({ module: AUDIT_MODULE_PROFESSIONALS, rootDocumentId: userRowId, section: SECTION_PROFESSIONAL_SOCIAL_MEDIA }),
  ])
  if (pendingBasicDetails?.payload) Object.assign(details, buildOverlayPayload(pendingBasicDetails.payload, pendingBasicDetails.changes))
  if (pendingSocialMedia?.payload) Object.assign(details, buildOverlayPayload(pendingSocialMedia.payload, pendingSocialMedia.changes))
}

// Ports controllers/app/users/setting.js's GET /new_user_individual_details (~1042-1284) — a
// no-login-token (`checkApiKey`-only) variant, its own full aggregation (not delegated to the
// shared service above). Same behavior, same response shape.
export async function getNewUserIndividualDetails(userRowIdRaw: unknown, apiForTypeRaw: unknown) {
  const userRowId = !Number.isNaN(Number.parseInt(userRowIdRaw as string)) ? Number.parseInt(userRowIdRaw as string) : 0
  if (!userRowId) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User Row ID.' } }
  }

  const getQuery: any[] = await ProfessionalM.aggregate([
    { $match: { _id: userRowId } },
    { $lookup: { from: 'cln_static_countries', localField: 'country_id', foreignField: '_id', as: 'info_country' } },
    { $unwind: { path: '$info_country', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'info_img' } },
    { $unwind: { path: '$info_img', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_social_links', localField: '_id', foreignField: 'user_row_id', as: 'social_info' } },
    { $unwind: { path: '$social_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_seo_details', localField: '_id', foreignField: 'user_row_id', as: 'seo_info' } },
    { $unwind: { path: '$seo_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_user_designations', localField: 'designation_id', foreignField: '_id', as: 'info_designations', pipeline: [{ $project: { _id: 1, designation_name: 1 } }] } },
    { $lookup: { from: 'cln_push_notifications_details', localField: '_id', foreignField: 'user_row_id', as: 'info_push_notification', pipeline: [{ $project: { push_notification_status: 1 } }] } },
    { $unwind: { path: '$info_push_notification', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_user_looking_for_lists', localField: 'looking_for_id', foreignField: '_id', as: 'info_looking_for_list', pipeline: [{ $match: { active_status: true } }, { $project: { _id: 1, name: 1 } }] } },
    {
      $project: {
        _id: 1, account_visible_type: 1, user_name: 1, full_name: 1, email_id: 1, mobile_number: 1, country_id: 1,
        login_status: 1, gender: 1, created_date_n_time: 1, referral_user_name: 1, podcast_title: 1, designation_id: 1,
        pro_batch: 1, approval_status: 1, sub_admin_row_id: 1, claim_status: 1, email_verify_status: 1, about_in_one_line: 1,
        rejected_date_n_time: 1, location: 1, feed_url: '$social_info.feed_url', website: '$social_info.website',
        looking_for_id: '$looking_for_id', user_bio: 1, facebook: '$social_info.facebook', twitter: '$social_info.twitter',
        linkedin: '$social_info.linkedin', instagram: '$social_info.instagram', video_link: '$social_info.video_link',
        telegram: '$social_info.telegram', medium: '$social_info.medium', reddit: '$social_info.reddit',
        youtube_channel: '$social_info.youtube_channel', meta_keywords: '$seo_info.meta_keywords',
        meta_description: '$seo_info.meta_description', email_status: '$seo_info.email_status', vcf_status: 1,
        area: 1, city: 1, state: 1, longitude: 1, latitude: 1, designation_list: '$info_designations',
        looking_for_list: '$info_looking_for_list', country_name: '$info_country.country_name',
        country_flag: '$info_country.country_flag', country_code: '$info_country.country_code',
        profile_image: '$info_img.profile_image', push_notification_status: '$info_push_notification.push_notification_status',
      },
    },
  ])

  if (!getQuery[0]) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User Row ID.' } }
  }

  const result: any = getQuery[0]
  result.total_followers = 0

  const apiForType = Number.parseInt(apiForTypeRaw as string) === 2 ? 2 : 1
  if (apiForType === 2) {
    const usersFollowersQuery = await ProfessionalsFollowersM.aggregate([
      { $match: { following_user_row_id: userRowId, confirm_request_status: 2 } },
      { $lookup: { from: 'cln_professionals', localField: 'follower_user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $match: { login_status: 1 } }, { $project: { _id: 1 } }] } },
      { $unwind: { path: '$user_info' } },
      { $count: 'count' },
    ])
    if (usersFollowersQuery[0]) result.total_followers = usersFollowersQuery[0].count
  }

  return { status: true, message: result }
}

// Ports POST /update_username (setting.js ~1358-1414).
export async function updateUsername(auth: UserTokenAuthResult, userNameRaw: string | undefined, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = { ...preValidationErrors }
  const userRowId = auth.message

  let userName = ''
  if (userNameRaw) {
    userName = sanitize(userNameRaw).toLowerCase()
    const checkQuery = await ProfessionalM.findOne({ $and: [{ _id: { $ne: sanitize(userRowId) } }, { user_name: userName }] })
    if (checkQuery) errObj['user_name'] = 'This username is already in use.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const innerCheckQuery = await ProfessionalM.findOne({ _id: userRowId }, { _id: 1, user_name: 1 })
  if (innerCheckQuery?.user_name) {
    return { status: false, message: { alert_message: 'Sorry, Your username is already updated.' } }
  }

  const updateFields = getUpdateTrackerFields(auth)
  await ProfessionalM.updateOne({ _id: userRowId }, { $set: { user_name: userName, updated_date_n_time: getPresentDateTime(), ...updateFields } })
  await updateThreadNotification({
    user_row_id: -1,
    notify_type: 1,
    notify_type_row_id: userRowId,
    message_row_id: 3,
    action_row_id: userRowId,
  })
  await calculateUserProfileScore(userRowId, ['professional_profile'])

  return { status: true, message: { alert_message: 'Your profile username has been updated successfully.' } }
}

// Ports POST /verify_email_account (setting.js ~1418-1465).
export async function verifyEmailAccount(auth: UserTokenAuthResult, otpNumberRaw: unknown, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth
  if (Object.keys(preValidationErrors).length > 0) return { status: false, message: preValidationErrors }

  const userRowId = Number.parseInt(String(auth.message))
  const checkEmailQuery = await VerifyEmailM.findOne({ user_row_id: userRowId, email_verify_status: false })
  if (!checkEmailQuery) {
    return { status: false, message: { alert_message: 'Sorry, This token field is expired.' } }
  }

  // eslint-disable-next-line eqeqeq -- ports legacy's loose OTP comparison as-is (otp_number arrives as a string, stored value may be number or string)
  if (checkEmailQuery.email_otp_number != otpNumberRaw) {
    return { status: false, message: { otp_number: 'Sorry, Your OTP is not matching' } }
  }

  await VerifyEmailM.updateOne({ user_row_id: userRowId }, { $set: { email_otp_number: '', email_verify_code: '', email_verify_status: true } })
  return { status: true, message: { alert_message: 'Your email account has been verified successfully.' } }
}

// Ports GET /resend_otp (setting.js ~1469-1524).
export async function resendOtp(auth: UserTokenAuthResult) {
  if (!auth.status) return { status: false, message: { alert_message: auth.message } }

  const userRowId = Number.parseInt(String(auth.message))
  const verifyOtp = randomstring.generate({ length: 6, charset: '123456789' })
  const userQuery = await ProfessionalM.findOne({ _id: userRowId }, { _id: 1, full_name: 1, email_id: 1 })
  const emailId = userQuery?.email_id
  const fullName = userQuery?.full_name

  const passSubject = `${verifyOtp} is OTP to verify email of coinpedia account.`
  const passMessage = `<div style="background:#fff;padding:40px 50px 30px;font-size:14px;line-height:1.4; border-radius: 5px;">
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${fullName},</h4>
                <div style="color:#000">
                    <p style="text-align:center;font-size: 17px;margin-top: 30px;font-weight: 500;"><b>WELCOME BACK TO COINPEDIA ACCOUNT</b></p>
                    <br>
                    <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verifyOtp}</b> is your OTP for email verification number to login your account.</p>
                </div>
            </div>`

  const checkEmailQuery = await VerifyEmailM.findOne({ user_row_id: userRowId })
  if (checkEmailQuery) {
    if (checkEmailQuery.email_verify_status) {
      return { status: false, message: { alert_message: 'Sorry, Your account email is already in verified state.' } }
    }
    await VerifyEmailM.updateOne({ user_row_id: userRowId }, { $set: { email_otp_number: verifyOtp } })
    await sendEmail(emailId, passSubject, passMessage)
    return { status: true, message: { alert_message: 'Your account email has been verified successfully.' } }
  }

  await VerifyEmailM({ email_otp_number: verifyOtp, email_verify_status: false, user_row_id: userRowId }).save()
  await sendEmail(emailId, passSubject, passMessage)
  return { status: true, message: { alert_message: 'Your new email id has been updated successfully. Please verify your email id.' } }
}

// Ports POST /change_mobile_number (setting.js ~1526-1592).
export async function changeMobileNumber(auth: UserTokenAuthResult, body: { mobile_number?: string; country_mobile_id?: unknown }, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = { ...preValidationErrors }
  const userRowId = Number.parseInt(String(auth.message))

  if (body.mobile_number) {
    if (body.mobile_number.match(/[^0-9\-()\s]/)) {
      errObj['mobile_number'] = 'The Mobile Number field cannot have speacial charaters.'
    }
    const checkMobileNumQuery = await ProfessionalM.findOne({ $and: [{ _id: { $ne: sanitize(userRowId) } }, { mobile_number: sanitize(body.mobile_number) }] })
    if (checkMobileNumQuery) errObj['mobile_number'] = 'This Mobile number is already in use.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const updateArray: Record<string, unknown> = { mobile_number: body.mobile_number, updated_date_n_time: getPresentDateTime() }
  if (body.country_mobile_id) updateArray['country_mobile_id'] = body.country_mobile_id
  Object.assign(updateArray, getUpdateTrackerFields(auth))

  const verifyMobileNumQuery = await VerifyMobileNumberM.findOne({ user_row_id: userRowId })
  await Promise.all([
    ProfessionalM.updateOne({ _id: userRowId }, { $set: updateArray }),
    verifyMobileNumQuery
      ? VerifyMobileNumberM.updateOne({ user_row_id: userRowId }, { $set: { mobile_verify_status: false } })
      : VerifyMobileNumberM({ mobile_verify_status: false, user_row_id: userRowId }).save(),
  ])

  await Promise.all([
    deleteKeysByPattern('app_user_detail_*'),
    deleteKeysByPattern('app_company_individual_other_details_*'),
    calculateUserProfileScore(userRowId, ['professional_profile']),
  ])

  return { status: true, message: { alert_message: 'Your new mobile number has been updated successfully.' } }
}

// Ports GET /company_suggestion_list/:search_value (setting.js ~1598-1666).
export async function getCompanySuggestionListResponse(searchValue: string) {
  const companyRegQuery = await CompanyM.aggregate([
    {
      $match: {
        $and: [
          { active_status: 1 },
          { approval_status: 1 },
          { $or: [{ company_id: { $regex: searchValue, $options: 'i' } }, { company_name: { $regex: searchValue, $options: 'i' } }] },
        ],
      },
    },
    { $project: { _id: 1, company_id: 1, company_name: 1, company_email_id: 1, company_logo: 1, website_link: 1 } },
  ]).limit(15)

  if (companyRegQuery.length > 0) {
    return { status: true, message: companyRegQuery, company_type: 1 }
  }

  const companyManualQuery = await CompanyManualRetrievalsM.aggregate([
    {
      $match: {
        $and: [
          { approval_status: 0 },
          { $or: [{ company_name: { $regex: searchValue, $options: 'i' } }, { company_email_id: { $regex: searchValue, $options: 'i' } }] },
        ],
      },
    },
    { $project: { _id: 1, company_name: 1, company_email_id: 1, company_logo: 1, website_link: 1 } },
  ]).limit(15)

  return { status: true, message: companyManualQuery, company_type: 2 }
}

// Ports GET /company_suggestion/:search_value (setting.js ~1670-1699) — a thin wrapper around the
// already-existing, already-TS getCompanySuggestions() (services/app/settings.ts), same pattern as
// getUsersProfessionalDetailsResponse()/getUserIndividualDetailsResponse() above.
export async function getCompanySuggestionResponse(searchValue: string) {
  const result: any = await getCompanySuggestions(searchValue)
  if (result.status) {
    return {
      status: true,
      message: result.message,
      company_type: result.company_type,
      cache_response_status: result.cache_response_status || false,
      response_time: result.response_time,
    }
  }
  return { status: false, message: result.message, response_time: result.response_time }
}

// Ports GET /user_suggestion/:search_value (setting.js ~1702-1721) — a thin wrapper around the
// already-existing, already-TS getUserSuggestionDetails() (services/app/settings.ts).
export async function getUserSuggestionResponse(searchValue: string) {
  const result: any = await getUserSuggestionDetails(searchValue)
  return { status: result.status, message: result.message, user_type: result.user_type }
}

// Ports POST /update_wallet_address (setting.js ~1725-1764).
export async function updateWalletAddress(auth: UserTokenAuthResult, walletAddressRaw: string | undefined, preValidationErrors: Record<string, unknown>) {
  if (!auth.status) return auth

  const errObj: Record<string, unknown> = { ...preValidationErrors }
  const userRowId = auth.message
  const walletAddress = sanitize(walletAddressRaw ?? '').toLowerCase()

  if (!errObj['wallet_address']) {
    const checkWalletAddr = await ProfessionalM.findOne({ $and: [{ _id: { $ne: userRowId } }, { wallet_address: walletAddress }] })
    if (checkWalletAddr) errObj['alert_message'] = 'Sorry, This wallet address is already in use.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  await ProfessionalM.updateOne({ _id: userRowId }, { $set: { wallet_address: walletAddress } })
  return { status: true, message: { alert_message: 'Your wallet address updated successfully.' } }
}

// Ports GET /update_push_notification (setting.js ~1287-1342). Flagged, not fixed: legacy's catch
// block leaks `err.message` directly in the response body (not even a generic message) — a
// pre-existing gap, ported as-is since changing the error response shape needs sign-off first.
export async function updatePushNotification(auth: UserTokenAuthResult, pushNotificationStatusRaw: unknown) {
  if (!auth.status) return auth
  if (!pushNotificationStatusRaw) {
    return { status: false, message: { push_notification_status: 'The notification status field is required.' } }
  }

  const pushNotificationStatus = Number.parseInt(String(pushNotificationStatusRaw))
  if (![1, 2].includes(pushNotificationStatus)) {
    return { status: false, message: { push_notification_status: 'Invalid notification status type.' } }
  }

  const userRowId = auth.message
  const updatedOn = getPresentDateTime()
  const getQuery = await PushNotificationsDetailsM.findOne({ user_row_id: userRowId })
  if (getQuery) {
    await PushNotificationsDetailsM.updateOne({ user_row_id: userRowId }, { $set: { push_notification_status: pushNotificationStatus, updated_on: updatedOn } })
  } else {
    await PushNotificationsDetailsM({ updated_on: updatedOn, push_notification_status: pushNotificationStatus, user_row_id: userRowId }).save()
  }

  return { status: true, message: { alert_message: 'Visited history details has been updated successfully.' } }
}

// Ports GET /public_status_list (setting.js ~2355-2375). Legacy quirk preserved: this route never
// hard-fails on a missing/invalid token — it falls back to the raw `user_row_id` query param
// instead (checkApiKey-only in effect), so `auth` here is advisory, not a gate.
export async function getPublicStatusList(auth: UserTokenAuthResult, queryUserRowIdRaw: unknown) {
  const userRowId = auth.status ? auth.message : Number.parseInt(String(queryUserRowIdRaw))
  const query = await ProfessionalsWorkExperienceM.find({ user_row_id: userRowId, till_date_status: 2 }, { position: 1, company_name: 1, public_view: 1 })
  return { status: true, message: query }
}
