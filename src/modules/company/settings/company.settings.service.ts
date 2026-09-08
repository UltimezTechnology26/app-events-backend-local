// modules/company/company.settings.service.ts
import { array_column } from '../../../../utils/helpers/helper'
import {
  findApprovedLoggedInProfessional,
  findCompanyByUserRowId,
  findCompanyByCompanyIdExcluding,
  findCompanyByEmailExcluding,
  findCompanyByContactNumberExcluding,
  findExchangeBodyById,
  findCompanyApprovalStatus,
  findCompanySeoDetailsForUpdate,
  updateCompanyBasicDetails,
  upsertCompanySeoDetails,
  upsertCompanySocialLinks,
  findManualCompanyById,
  findProfessionalFullName,
  findCompanySocialLinksId,
  findCompanySocialLinksLean,
  updateCompanySocialLinks,
  aggregateProfessionalContactInfo,
  aggregateSubAdminContactInfo,
  runIndividualDetailsAggregate,
  findPartnerStatus,
  aggregateCompanyFollowersCount,
  findCompanyLogo,
  updateCompanyLogoFields,
  findFollowerRecord,
  findActiveApprovedCompany,
  findProfessionalById,
  findCompanyById,
  countCompanyFollowersDocs,
  findCompanyIdByUserRowId,
  findWalletAddress,
  findVerifyEmailRecord,
  findApprovedActiveCompanyByUser,
  findProfessionalProfileImage,
  clearVerifyEmailOtp,
  findVerifiedLoggedInProfessional,
  findCompanyEmailVerifyInfo,
  updateCompanyEmailVerifyOtp,
  findCompanyByCondition,
  findCompanySeoDetailsRaw,
  findCompanySeoDetailsLean,
  findCompanyBasicDetailsLean,
  upsertCompanySeoData,
  runGetCompanySeoAggregate,
  runCompanyFollowersAggregate
} from './company.settings.queries'
import { submitChangeRequest } from '../../../common/change-request/change-request.service'
import { findPendingRequest } from '../../../common/change-request/change-request.queries'
import { computeDiff } from '../../../common/change-request/change-request.diff'
import { SECTION_SEO, SECTION_SOCIAL_MEDIA, SECTION_BASIC_DETAILS } from '../../../common/change-request/change-request.registry'
import { CHANGE_REQUEST_ACTION } from '../../../common/change-request/change-request.types'
import { toActorRefWithId } from '../../../common/status-audit/status-audit.actor'
import { ActorRef } from '../../../common/status-audit/status-audit.types'
import { AUDIT_MODULE_COMPANY } from '../../../common/status-audit/status-audit.registry'
import { insertChangeLog } from '../../../common/status-audit/status-audit.queries'
import logger from '../../../../config/logger'
const { getCollectionID } = require('../../../../utils/helpers/database_helper')
import {
  invalidateBasicDetailsCaches,
  invalidateCompanyLogoCaches,
  invalidateFollowCaches,
  invalidateRemoveFollowerCaches,
  invalidateSocialDetailsCache,
  invalidateSeoCaches,
  buildCompanyFollowersKey,
  buildCompanySeoKey,
  getCache,
  setCache,
} from './company.settings.cache'

const USER_TYPE_COMPANY_OWNER = 1
const ADMIN_ROW_ID_MAIN_ADMIN = 0

// Same ten fields as COMPANY_SECTION_REGISTRY[SECTION_SEO].editableFields. Kept as a local
// constant rather than importing the registry entry: the registry is built around admin-panel
// change requests, and this owner-path log write is a separate, ungated concern that happens
// to reuse the same diff engine.
const OWNER_SEO_EDITABLE_FIELDS = [
  'meta_title', 'meta_description', 'meta_keywords', 'robots_index', 'robots_follow',
  'twitter_creator', 'og_title', 'og_description', 'twitter_title', 'twitter_description',
] as const

// Same eleven fields as COMPANY_SECTION_REGISTRY[SECTION_SOCIAL_MEDIA].editableFields — see
// OWNER_SEO_EDITABLE_FIELDS for why this is a local constant rather than a registry import.
const OWNER_SOCIAL_MEDIA_EDITABLE_FIELDS = [
  'facebook', 'twitter', 'linkedin', 'instagram', 'video_link', 'telegram',
  'youtube_channel', 'medium', 'reddit', 'feed_url', 'other_social_links',
] as const

const sanitize = require('mongo-sanitize')
const randomstring = require('randomstring')
const companyM = require('../../../../models/app/company/companyM')
const company_social_linksM = require('../../../../models/app/company/company_social_linksM')
const followersM = require('../../../../models/app/company/followersM')
const company_wallet_addressM = require('../../../../models/app/company/company_wallet_addressM')
const sub_admin_emailsM = require('../../../../models/admin_panel/app/sub_admin_emailsM')
const seo_change_logsM = require('../../../../models/seo_change_logsM')
const company_seo_detailsM = require('../../../../models/app/company/company_seo_detailsM')
import { getAdminCompanyEmployeeList } from '../../team-members/team-members.queries'
import { getRevenueListAdmin } from '../../company_revenue/company_revenue.queries'
import { getFundsRaisedListAdmin, getInvestorList } from '../../funding/funding.service'
const {
  getPresentDateTime,
  validateAndSaveImage,
  company_profile_completed_percentage,
  deleteImageDigitalOcean,
  removeHtmltag,
} = require('../../../../utils/helpers/helper')
import { arrangeValidation, getIntIdFromArray } from '@ultimez-interview/coinpedia-backend-library/validation'
const { checkAllLoginToken, checkUserLoginToken, verifyEmailTempToken, generateUserLoginToken } = require('../../../../middleware/authorization')
const { sendEmail } = require('../../../../config/email')
const { updateThreadNotification } = require('../../../../utils/helpers/notification_helper')
const { checkCompanyRowID, calculateCompanyProfileScore, deleteCompanyFollowers } = require('../../../../utils/helpers/app_helper')
const { shiftCompanyFromManualToRegister } = require('../../../../utils/helpers/events_helper')
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'

/**
 * Ports setting.js's local sub_admin_email() helper (lines 1441-1455) verbatim — notifies
 * every type-2/3 sub-admin by email when a new company profile is created.
 */
interface SubAdminEmailRow {
  full_name: string
  email_id: string
}

async function notifySubAdminsOfNewCompany(subadminData: SubAdminEmailRow[], emailData: { full_name: string; company_name: string; updated_date_n_time: Date | string }) {
  for (const subadmin of subadminData) {
    const pass_subject = ' Company Approval Request'
    const message_to_pass = `
            <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${subadmin.full_name},</p>
            <p style="color:#000;font-weight: 400;font-size:17px;">A new company profile has been created by <span style="text-transform: capitalize;font-weight: 500;">${emailData.full_name}</span> on your platform, and we kindly request your review and approval of the Company.After approval, the company can unlock exciting features like hosting events, managing their company profile and building a strong team for success.</p>
            <p style="color:#000;font-weight: 400;font-size:17px; text-decoration:underline"><b>Company Details </b></p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Company Name : </b><span style="text-transform: capitalize;">${emailData.company_name}</span> </p>
            <p style="color:#000;font-weight: 400;font-size:17px;"><b>Created On :</b> ${emailData.updated_date_n_time} </p>
            `
    await sendEmail(subadmin.email_id, pass_subject, message_to_pass)
  }
}

interface ActorMessage {
  user_type: number
  user_row_id: number
}

type Actor =
  | { status: true; message: ActorMessage }
  | { status: false; message: string }

export interface CompanyRegulatoryDetailEntry {
  regulatory_bodies_ids: string
  country_id: string
  regulatory_types_id: string
}

/** Request-body shape for saveOrUpdateBasicCompanyDetails / saveOrUpdateBasicCompanyDetailsTeamPanel, derived from the fields both handlers actually read. */
export interface CompanyBasicDetailsBody {
  company_row_id?: string
  user_row_id?: string
  manual_company_row_id?: string
  business_model_id?: string[]
  regularities_details?: CompanyRegulatoryDetailEntry[]
  company_id?: string
  company_name?: string
  company_email_id?: string
  contact_number?: string
  website_link?: string
  describe_in_one_line?: string
  established_in?: string
  company_valuation?: string | number
  company_size_row_id?: string | number
  investor_category_row_id?: string | number
  country_id?: string | number
  country_mobile_id?: string | number
  company_location?: string
  city?: string
  state?: string
  longitude?: string
  latitude?: string
  nft_wallet_address?: string
  about_company?: string
  main_business_model_id?: string | number
  meta_keywords?: string
  meta_description?: string
  meta_title?: string
  youtube_channel?: string
}

export interface CompanyInsertPayload {
  business_model_id?: number[]
  main_business_model_id?: string | number
  regularities_details?: Array<{ regulatory_bodies_ids: number }>
  company_name?: string
  company_id?: string
  company_email_id?: string
  contact_number?: string
  website_link?: string
  describe_in_one_line?: string
  established_in?: string
  company_valuation?: string | number
  company_size_row_id?: string | number
  investor_category_row_id?: string | number
  country_id?: string | number
  country_mobile_id?: string | number
  company_location?: string
  city?: string
  state?: string
  longitude?: string
  latitude?: string
  nft_wallet_address?: string
  about_company?: string
  user_row_id?: number
  sub_admin_row_id?: number
  claim_status?: number
  created_date_n_time?: string
  updated_date_n_time?: string
  approval_status?: number
  // Index signature so this structurally satisfies the query layer's generic
  // Record<string, unknown> Mongo $set parameter (updateCompanyBasicDetails) —
  // same convention already used by CompanyManualRetrievalDoc in queries.ts.
  [key: string]: unknown
}

export interface CompanySeoUpdatePayload {
  company_row_id?: number
  meta_keywords?: string
  meta_description?: string
  meta_title?: string
  og_title?: string
  og_description?: string
  twitter_title?: string
  twitter_description?: string
  // Index signature so this structurally satisfies upsertCompanySeoDetails'
  // generic Record<string, unknown> Mongo $set parameter.
  [key: string]: unknown
}

/**
 * CONFIRMED BUG FIX: `regularities_details` entries carry a Mongo-injected subdocument `_id`
 * when read live (`findCompanyBasicDetailsLean`), but the submitted payload (rebuilt from the
 * admin form's own regulatory-rows state) never includes one — every admin edit produced a
 * spurious "changed" diff on this field, even when the admin never touched the regulatory
 * section at all. `_id` is DB bookkeeping, not admin-editable content, so it's stripped from the
 * live baseline before diffing (found live, 2026-09-05, reviewing a real submitted change request).
 */
function stripRegulatoryDetailIds(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((entry) => {
    if (entry && typeof entry === 'object' && '_id' in entry) {
      const { _id, ...rest } = entry as Record<string, unknown>
      return rest
    }
    return entry
  })
}

export interface SaveBasicCompanyDetailsParams {
  actor: Actor
  body: CompanyBasicDetailsBody
  preValidationErrors: Record<string, string>
}

/**
 * Ports setting.js's POST /update_basic_company_details (lines 121-645) — the main app-user
 * (or admin, via checkAllLoginToken's [7] allow-list) "create or update my company profile"
 * endpoint, including the manual-company claim shift (shiftCompanyFromManualToRegister) and
 * SEO/social-link side-effect writes.
 *
 * Ownership check deliberately kept as checkCompanyRowID, NOT upgraded to
 * common.ownership.ts's checkCompanyOwnership: that helper requires approval_status===1,
 * which would be wrong here — a company must be able to edit its own still-pending or
 * previously-rejected details in order to ever GET approved. checkCompanyRowID also returns
 * fields (company_logo, scores, etc.) this route family depends on that checkCompanyOwnership
 * doesn't provide. This is a deliberate, evidence-based decision, not an oversight.
 */
export async function saveOrUpdateBasicCompanyDetails({ actor, body, preValidationErrors }: SaveBasicCompanyDetailsParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }
  let sub_admin_row_id = 0
  let user_row_id = 0
  let company_row_id = 0

  // Real source (setting.js:152-227) does NOT early-return on an auth failure — it falls
  // through to the business_model_id/regularities_details validation below (both independent
  // of the token), then checks the combined errObj once at the end. Preserved exactly, not
  // simplified into an early return, so a request that's both unauthenticated AND has invalid
  // business_model_id/regularities_details still surfaces both errors together like the source
  // does — not just the auth one.
  if (actor.status) {
    if (actor.message.user_type == 1) {
      user_row_id = actor.message.user_row_id
      const check_company_res = await findApprovedLoggedInProfessional(user_row_id)
      if (!check_company_res) {
        errObj['alert_message'] = 'Your profile is currently under approval. Please wait, while the admin approves your profile.'
      }
    } else {
      sub_admin_row_id = actor.message.user_row_id
    }

    if (body.company_row_id) {
      if (!Number.isNaN(Number.parseInt(body.company_row_id))) {
        const check_company_res = await checkCompanyRowID({ company_row_id: Number.parseInt(body.company_row_id), user_row_id })
        if (!check_company_res.status) {
          errObj['alert_message'] = check_company_res.message.alert_message
        } else {
          company_row_id = Number.parseInt(body.company_row_id)
        }
      }
    }

    if (actor.message.user_type == 1) {
      if (!company_row_id) {
        const check_user_company_query = await findCompanyByUserRowId(user_row_id)
        if (check_user_company_query) {
          errObj['alert_message'] = 'Sorry, a company has already been created for your user account'
        }
      }
    }

    if (!company_row_id && user_row_id) {
      const check_company_res2 = await checkCompanyRowID({ company_row_id: 0, user_row_id })
      if (check_company_res2.status) {
        errObj['alert_message'] = 'Sorry, a company has already been created for your user account.'
      }
    }

    if (body.company_id) {
      const check_company_id_query = await findCompanyByCompanyIdExcluding({ company_row_id, company_id: sanitize(body.company_id) })
      if (check_company_id_query) {
        errObj['company_id'] = 'The Company ID is already in use.'
      }
    }

    if (body.company_email_id) {
      const check_email_id_query = await findCompanyByEmailExcluding({ company_row_id, company_email_id: sanitize(body.company_email_id) })
      if (check_email_id_query) {
        errObj['company_email_id'] = 'The Company Email ID is already in use.'
      }
    }

    if (body.contact_number) {
      if (body.contact_number.match(/[^0-9\-(\)\s]/)) {
        errObj['contact_number'] = 'The Contact Number field cannot have speacial charaters.'
      }
      const check_mobile_number_query = await findCompanyByContactNumberExcluding({ company_row_id, contact_number: sanitize(body.contact_number) })
      if (check_mobile_number_query) {
        errObj['contact_number'] = 'The Contact Number is already in use.'
      }
    }
  } else {
    errObj['alert_message'] = actor.message
  }

  let business_model_id: number[] = []
  if (body.business_model_id && body.business_model_id.length > 0) {
    const business_model_id_array = await Promise.resolve(getIntIdFromArray(body.business_model_id))
    if (business_model_id_array.length > 0) {
      business_model_id = business_model_id_array
    } else {
      errObj['business_model_id'] = 'The Business Model Ids field must be integer in object'
    }
  }

  const invalidEntries: number[] = []
  const regularitiesArray: Array<{ regulatory_bodies_ids: number }> = []
  if (body.regularities_details && Array.isArray(body.regularities_details) && body.regularities_details.length > 0) {
    for (let i = 0; i < body.regularities_details.length; i++) {
      const entry = body.regularities_details[i]
      const parsed_bodies_ids = Number.parseInt(entry.regulatory_bodies_ids)
      const parsed_country_id = Number.parseInt(entry.country_id)
      const parsed_types_id = Number.parseInt(entry.regulatory_types_id)

      if (Number.isNaN(parsed_bodies_ids)) {
        invalidEntries.push(i + 1)
        continue
      }

      const bodyDoc = await findExchangeBodyById(parsed_bodies_ids)
      if (bodyDoc?.country_id && bodyDoc?.regulatory_type_id) {
        regularitiesArray.push({ regulatory_bodies_ids: parsed_bodies_ids })
      } else {
        if (Number.isNaN(parsed_country_id) || Number.isNaN(parsed_types_id)) {
          invalidEntries.push(i + 1)
          continue
        }
        regularitiesArray.push({ regulatory_bodies_ids: parsed_bodies_ids })
      }
    }
    if (invalidEntries.length > 0) {
      errObj['regularities_details'] = `Invalid regularities data at entries: ${invalidEntries.join(', ')}`
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const date_n_time = getPresentDateTime()
  const insertArray: CompanyInsertPayload = {
    business_model_id,
    main_business_model_id: body.main_business_model_id,
    regularities_details: regularitiesArray,
    company_name: body.company_name,
    company_id: (body.company_id as string).toLowerCase(),
    company_email_id: body.company_email_id,
    contact_number: body.contact_number,
    website_link: body.website_link,
    describe_in_one_line: body.describe_in_one_line,
    established_in: body.established_in,
    company_valuation: body.company_valuation,
    company_size_row_id: body.company_size_row_id,
    investor_category_row_id: body.investor_category_row_id,
    country_id: body.country_id,
    country_mobile_id: body.country_mobile_id,
    company_location: body.company_location,
    city: body.city ? body.city : '',
    state: body.state ? body.state : '',
    longitude: body.longitude ? body.longitude : '',
    latitude: body.latitude ? body.latitude : '',
    nft_wallet_address: body.nft_wallet_address ? (body.nft_wallet_address as string).trim() : '',
    about_company: body.about_company,
  }

  const seoArray: CompanySeoUpdatePayload = {
    meta_keywords: body.meta_keywords,
    meta_description: body.meta_description,
    meta_title: body.meta_title,
  }
  const socialArray: CompanySocialLinksPayload = { youtube_channel: body.youtube_channel }

  if (!company_row_id) {
    insertArray['user_row_id'] = user_row_id
    // actor.status is guaranteed true here (the errObj-empty check above already returned
    // otherwise), but that narrowing doesn't persist outside the `if (actor.status)` block
    // above — re-checked here just to satisfy TypeScript, not a new runtime condition.
    if (actor.status && actor.message.user_type == 2) {
      insertArray['sub_admin_row_id'] = sub_admin_row_id
      insertArray['claim_status'] = 1
    }
    insertArray['created_date_n_time'] = date_n_time

    // REVERTED: admin-panel company creation used to route through submitChangeRequest here
    // (a reserved company_row_id, staged as a pending 'create' request), extending the same
    // publish gate every EDIT to an existing company already goes through. Explicitly reverted —
    // unlike an edit, a brand-new company has no existing view page for an admin to open and
    // review/publish a pending creation against, so the request would sit in the global Pending
    // Changes queue with nowhere else to action it from. Company creation (admin or self-service
    // owner alike) now always saves directly, live immediately; only EDITS to an already-existing
    // company go through the change-request/approval flow.
    const saveCompanyDetails = await companyM(insertArray).save()

    seoArray['company_row_id'] = saveCompanyDetails._id
    socialArray['company_row_id'] = saveCompanyDetails._id

    if (insertArray.about_company) {
      const cleanedBio = removeHtmltag(insertArray.about_company).slice(0, 160)
      seoArray.meta_description = cleanedBio
      seoArray.og_description = cleanedBio
      seoArray.twitter_description = cleanedBio
    }

    if (insertArray.company_name) {
      const title = insertArray.company_name + ' | Coinpedia Company Listing'
      seoArray.meta_title = title
      seoArray.og_title = title
      seoArray.twitter_title = title
      seoArray.meta_keywords = insertArray.company_name
    }

    const hasChanged = (newVal: string | undefined) => (newVal ?? '').trim() !== ''
    // Was an inline `user_type === 1 ? 'user' : 'admin'` ternary that always collapsed
    // subadmin edits into 'admin' in this audit log - getUpdateTrackerFields distinguishes
    // all three (admin/subadmin/user), same as this file's other already-migrated call
    // sites (getUpdateTrackerFields(actor), e.g. below) - fixes the misattribution, not
    // just a refactor.
    const seoLogTrackerFields = getUpdateTrackerFields(actor)
    await seo_change_logsM.create({
      module_key: 'company',
      module_id: saveCompanyDetails._id,
      old_meta_title: '',
      new_meta_title: hasChanged(seoArray.meta_title) ? seoArray.meta_title : '',
      old_meta_description: '',
      new_meta_description: hasChanged(seoArray.meta_description) ? seoArray.meta_description : '',
      old_meta_keywords: '',
      new_meta_keywords: hasChanged(seoArray.meta_keywords) ? seoArray.meta_keywords : '',
      old_og_title: '',
      new_og_title: hasChanged(seoArray.og_title) ? seoArray.og_title : '',
      old_og_description: '',
      new_og_description: hasChanged(seoArray.og_description) ? seoArray.og_description : '',
      old_twitter_title: '',
      new_twitter_title: hasChanged(seoArray.twitter_title) ? seoArray.twitter_title : '',
      old_twitter_description: '',
      new_twitter_description: hasChanged(seoArray.twitter_description) ? seoArray.twitter_description : '',
      user_type: seoLogTrackerFields.updated_by ?? 'admin',
      updated_by: seoLogTrackerFields.updated_by_row_id ?? 0,
    })

    // Company creation itself was never logged — the History tab only ever showed later
    // events (an edit's own submit/approve/publish entries), never who actually created the
    // company or when, even though that's already known here (seoLogTrackerFields, right
    // above). `section: 'creation'` matches the same literal section markets' own
    // approveExchangeCreation/approveDexCreation already use for a whole-entity creation
    // entry (see HistoryFeed.tsx's own getBadge/getContext special-casing for it) — renders
    // as a plain "Created" card instead of an awkwardly-worded "Basic_details Created" one.
    try {
      await insertChangeLog({
        module: AUDIT_MODULE_COMPANY,
        target_collection: 'cln_company_lists',
        target_row_id: saveCompanyDetails._id,
        root_document_id: saveCompanyDetails._id,
        section: 'creation',
        action: 'create',
        actor: toActorRefWithId(seoLogTrackerFields, seoLogTrackerFields.updated_by_row_id),
        changes: [{ field: 'name', field_label: 'Name', old_value: null, old_label: null, new_value: saveCompanyDetails.company_name, new_label: null }],
        reason: null,
        snapshot: null,
      })
    } catch (err) {
      logger.error({ err, company_row_id: saveCompanyDetails._id }, 'company.settings: creation change log write failed')
    }

    await company_social_linksM(socialArray).save()
    await company_seo_detailsM(seoArray).save()
    await invalidateBasicDetailsCaches()

    await updateThreadNotification({
      user_row_id: -1,
      notify_type: 2,
      notify_type_row_id: saveCompanyDetails._id,
      message_row_id: 9,
      action_row_id: saveCompanyDetails._id,
    })

    if (!Number.isNaN(Number.parseInt(body.manual_company_row_id ?? ''))) {
      const manual_company_row_id = Number.parseInt(body.manual_company_row_id ?? '')
      const check_manual_query = await findManualCompanyById(manual_company_row_id)
      if (check_manual_query) {
        await shiftCompanyFromManualToRegister({ manual_company_row_id, register_company_row_id: saveCompanyDetails._id, sub_admin_row_id })
      }
    }

    if (user_row_id) {
      const sub_admin_data = await sub_admin_emailsM.find({ type: { $in: [2, 3] } }, { full_name: 1, email_id: 1 })
      const user_query = await findProfessionalFullName(user_row_id)
      await notifySubAdminsOfNewCompany(sub_admin_data, {
        full_name: user_query!.full_name,
        company_name: saveCompanyDetails.company_name,
        updated_date_n_time: saveCompanyDetails.updated_date_n_time,
      })
    }

    await calculateCompanyProfileScore(saveCompanyDetails._id, ['basic', 'team_detail'])

    return {
      status: true,
      message: {
        alert_message: 'Your company details have been updated successfully. Thank you for keeping your company information current!',
        company_row_id: saveCompanyDetails._id,
      },
    }
  }

  const check_company_status = await findCompanyApprovalStatus(company_row_id)
  const check_company_seo = await findCompanySeoDetailsForUpdate(company_row_id)

  if (check_company_status!.approval_status === 2) {
    insertArray['approval_status'] = 0
  }

  Object.assign(insertArray, getUpdateTrackerFields(actor))
  insertArray['updated_date_n_time'] = date_n_time

  // Publish gate applies to admin-panel edits only (design §2) — a company owner editing their
  // own profile keeps writing live immediately, exactly as before.
  if (actor.status && actor.message.user_type !== USER_TYPE_COMPANY_OWNER) {
    const adminRowId = Number(actor.message.user_row_id)
    const liveValues = (await findCompanyBasicDetailsLean(company_row_id)) ?? {}
    if ('regularities_details' in liveValues) {
      liveValues.regularities_details = stripRegulatoryDetailIds(liveValues.regularities_details)
    }
    return submitChangeRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_BASIC_DETAILS,
      rootDocumentId: company_row_id,
      targetRowId: null,
      liveValues,
      submitted: insertArray,
      actor: toActorRefWithId(
        {
          updated_by: adminRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: adminRowId,
        },
        adminRowId,
      ),
    })
  }

  await updateCompanyBasicDetails({ company_row_id, insertArray })

  if (insertArray.about_company) {
    if (!check_company_seo?.meta_description) {
      const cleanedBio = removeHtmltag(insertArray.about_company).slice(0, 160)
      seoArray.meta_description = cleanedBio
      seoArray.og_description = cleanedBio
      seoArray.twitter_description = cleanedBio
    } else if (!check_company_seo.og_description) {
      seoArray.og_description = check_company_seo?.meta_description
      seoArray.twitter_description = check_company_seo?.meta_description
    }
  }

  if (insertArray.company_name) {
    const title = insertArray.company_name + ' | Coinpedia Company Listing'
    if (!check_company_seo?.meta_title) {
      seoArray.meta_title = title
      seoArray.og_title = title
      seoArray.twitter_title = title
    } else if (!check_company_seo.og_title) {
      seoArray.og_title = check_company_seo?.meta_title
      seoArray.twitter_title = check_company_seo?.meta_title
    }
    if (!check_company_seo?.meta_keywords) {
      seoArray.meta_keywords = insertArray.company_name
    }
  }

  const hasChangedPair = (oldVal: string | undefined, newVal: string | undefined) => (newVal ?? '').trim() !== '' && (oldVal ?? '').trim() !== (newVal ?? '').trim()
  const changed =
    hasChangedPair(check_company_seo?.meta_title, seoArray.meta_title) ||
    hasChangedPair(check_company_seo?.meta_description, seoArray.meta_description) ||
    hasChangedPair(check_company_seo?.meta_keywords, seoArray.meta_keywords) ||
    hasChangedPair(check_company_seo?.og_title, seoArray.og_title) ||
    hasChangedPair(check_company_seo?.og_description, seoArray.og_description) ||
    hasChangedPair(check_company_seo?.twitter_title, seoArray.twitter_title) ||
    hasChangedPair(check_company_seo?.twitter_description, seoArray.twitter_description)

  if (changed) {
    // Same subadmin-misattribution fix as the insert-path seo_change_logsM.create above.
    const seoUpdateLogTrackerFields = getUpdateTrackerFields(actor)
    await seo_change_logsM.create({
      module_key: 'company',
      module_id: company_row_id,
      old_meta_title: check_company_seo?.meta_title || '',
      new_meta_title: hasChangedPair(check_company_seo?.meta_title, seoArray.meta_title) ? seoArray.meta_title : '',
      old_meta_description: check_company_seo?.meta_description || '',
      new_meta_description: hasChangedPair(check_company_seo?.meta_description, seoArray.meta_description) ? seoArray.meta_description : '',
      old_meta_keywords: check_company_seo?.meta_keywords || '',
      new_meta_keywords: hasChangedPair(check_company_seo?.meta_keywords, seoArray.meta_keywords) ? seoArray.meta_keywords : '',
      old_og_title: check_company_seo?.og_title || '',
      new_og_title: hasChangedPair(check_company_seo?.og_title, seoArray.og_title) ? seoArray.og_title : '',
      old_og_description: check_company_seo?.og_description || '',
      new_og_description: hasChangedPair(check_company_seo?.og_description, seoArray.og_description) ? seoArray.og_description : '',
      old_twitter_title: check_company_seo?.twitter_title || '',
      new_twitter_title: hasChangedPair(check_company_seo?.twitter_title, seoArray.twitter_title) ? seoArray.twitter_title : '',
      old_twitter_description: check_company_seo?.twitter_description || '',
      new_twitter_description: hasChangedPair(check_company_seo?.twitter_description, seoArray.twitter_description) ? seoArray.twitter_description : '',
      user_type: seoUpdateLogTrackerFields.updated_by ?? 'admin',
      updated_by: seoUpdateLogTrackerFields.updated_by_row_id ?? 0,
    })
  }

  await invalidateBasicDetailsCaches()
  await upsertCompanySeoDetails({ company_row_id, seoArray })
  await calculateCompanyProfileScore(company_row_id, ['basic', 'team_detail'])

  // CONFIRMED CLEANUP (Part 3 §7 Phase G, not a functional bug fix): the real source also
  // returned `insertArray` (the raw request-derived update payload) and the individual
  // deleteKeysByPattern() return values (`compayny_list_key`/`compayny_other_details_key`) in
  // this response — debug leftovers with zero consumers found in frontend-appcp-typescript
  // (grepped for all three identifiers, zero matches). Dropped rather than ported, since
  // leaking internal write payloads/cache-op results to the client has no purpose and no
  // dependent caller.
  return { status: true, message: { alert_message: 'Your company details have been successfully resubmitted. Thank you for keeping your company information current!' } }
}

export interface SaveBasicCompanyDetailsTeamPanelParams {
  body: CompanyBasicDetailsBody
  preValidationErrors: Record<string, string>
}

export interface ApplyBasicDetailsSideEffectsParams {
  action: 'create' | 'update'
  companyRowId: number
  payload: Record<string, unknown>
  actor: ActorRef
}

/**
 * Deferred side effects for the Basic Details change-request section, run by change-request.
 * apply.ts AFTER its transaction commits the actual company-row write (handled generically by
 * applyDocumentWrite there, same as every other document-scope section — this function never
 * writes the company row itself). Best-effort, same convention as that file's own post-
 * transaction insertChangeLog: a failure here doesn't roll back the already-committed row write.
 *
 * Replicates saveOrUpdateBasicCompanyDetails' own create/update side effects (SEO/social
 * seeding or merging, its audit log, sub-admin notification, manual-company shift, profile
 * score) against the APPROVED request's payload instead of a live request body, and
 * companyRowId instead of a freshly-resolved company_row_id — everything else about the
 * original logic (field names, SEO-merge rules, audit-log shape) is preserved verbatim.
 */
export async function applyBasicDetailsSideEffects({ action, companyRowId, payload, actor }: ApplyBasicDetailsSideEffectsParams): Promise<void> {
  const companyName = typeof payload.company_name === 'string' ? payload.company_name : undefined
  const aboutCompany = typeof payload.about_company === 'string' ? payload.about_company : undefined
  const auditActorType = actor.type === 'admin' || actor.type === 'subadmin' || actor.type === 'user' ? actor.type : 'admin'
  const auditActorId = actor.id ?? 0
  const hasChanged = (newVal: string | undefined) => (newVal ?? '').trim() !== ''

  if (action === 'create') {
    const seoArray: CompanySeoUpdatePayload = { company_row_id: companyRowId }
    const socialArray: CompanySocialLinksPayload = { company_row_id: companyRowId }

    if (aboutCompany) {
      const cleanedBio = removeHtmltag(aboutCompany).slice(0, 160)
      seoArray.meta_description = cleanedBio
      seoArray.og_description = cleanedBio
      seoArray.twitter_description = cleanedBio
    }
    if (companyName) {
      const title = `${companyName} | Coinpedia Company Listing`
      seoArray.meta_title = title
      seoArray.og_title = title
      seoArray.twitter_title = title
      seoArray.meta_keywords = companyName
    }

    await seo_change_logsM.create({
      module_key: 'company',
      module_id: companyRowId,
      old_meta_title: '',
      new_meta_title: hasChanged(seoArray.meta_title) ? seoArray.meta_title : '',
      old_meta_description: '',
      new_meta_description: hasChanged(seoArray.meta_description) ? seoArray.meta_description : '',
      old_meta_keywords: '',
      new_meta_keywords: hasChanged(seoArray.meta_keywords) ? seoArray.meta_keywords : '',
      old_og_title: '',
      new_og_title: hasChanged(seoArray.og_title) ? seoArray.og_title : '',
      old_og_description: '',
      new_og_description: hasChanged(seoArray.og_description) ? seoArray.og_description : '',
      old_twitter_title: '',
      new_twitter_title: hasChanged(seoArray.twitter_title) ? seoArray.twitter_title : '',
      old_twitter_description: '',
      new_twitter_description: hasChanged(seoArray.twitter_description) ? seoArray.twitter_description : '',
      user_type: auditActorType,
      updated_by: auditActorId,
    })

    await company_social_linksM(socialArray).save()
    await company_seo_detailsM(seoArray).save()
    await invalidateBasicDetailsCaches()

    await updateThreadNotification({
      user_row_id: -1,
      notify_type: 2,
      notify_type_row_id: companyRowId,
      message_row_id: 9,
      action_row_id: companyRowId,
    })

    const manualCompanyRowIdRaw = payload.manual_company_row_id
    const manualCompanyRowId = typeof manualCompanyRowIdRaw === 'string' || typeof manualCompanyRowIdRaw === 'number'
      ? Number.parseInt(String(manualCompanyRowIdRaw))
      : Number.NaN
    if (!Number.isNaN(manualCompanyRowId)) {
      const check_manual_query = await findManualCompanyById(manualCompanyRowId)
      if (check_manual_query) {
        const subAdminRowId = typeof payload.sub_admin_row_id === 'number' ? payload.sub_admin_row_id : 0
        await shiftCompanyFromManualToRegister({ manual_company_row_id: manualCompanyRowId, register_company_row_id: companyRowId, sub_admin_row_id: subAdminRowId })
      }
    }

    const userRowId = typeof payload.user_row_id === 'number' ? payload.user_row_id : 0
    if (userRowId) {
      const sub_admin_data = await sub_admin_emailsM.find({ type: { $in: [2, 3] } }, { full_name: 1, email_id: 1 })
      const user_query = await findProfessionalFullName(userRowId)
      const companyDoc = await findCompanyBasicDetailsLean(companyRowId)
      await notifySubAdminsOfNewCompany(sub_admin_data, {
        full_name: user_query!.full_name,
        company_name: companyName ?? '',
        updated_date_n_time: (companyDoc?.updated_date_n_time as Date | string | undefined) ?? new Date(),
      })
    }

    await calculateCompanyProfileScore(companyRowId, ['basic', 'team_detail'])
    return
  }

  const check_company_seo = await findCompanySeoDetailsForUpdate(companyRowId)
  const seoArray: CompanySeoUpdatePayload = {}

  if (aboutCompany) {
    if (!check_company_seo?.meta_description) {
      const cleanedBio = removeHtmltag(aboutCompany).slice(0, 160)
      seoArray.meta_description = cleanedBio
      seoArray.og_description = cleanedBio
      seoArray.twitter_description = cleanedBio
    } else if (!check_company_seo.og_description) {
      seoArray.og_description = check_company_seo?.meta_description
      seoArray.twitter_description = check_company_seo?.meta_description
    }
  }

  if (companyName) {
    const title = `${companyName} | Coinpedia Company Listing`
    if (!check_company_seo?.meta_title) {
      seoArray.meta_title = title
      seoArray.og_title = title
      seoArray.twitter_title = title
    } else if (!check_company_seo.og_title) {
      seoArray.og_title = check_company_seo?.meta_title
      seoArray.twitter_title = check_company_seo?.meta_title
    }
    if (!check_company_seo?.meta_keywords) {
      seoArray.meta_keywords = companyName
    }
  }

  const hasChangedPair = (oldVal: string | undefined, newVal: string | undefined) => (newVal ?? '').trim() !== '' && (oldVal ?? '').trim() !== (newVal ?? '').trim()
  const changed =
    hasChangedPair(check_company_seo?.meta_title, seoArray.meta_title) ||
    hasChangedPair(check_company_seo?.meta_description, seoArray.meta_description) ||
    hasChangedPair(check_company_seo?.meta_keywords, seoArray.meta_keywords) ||
    hasChangedPair(check_company_seo?.og_title, seoArray.og_title) ||
    hasChangedPair(check_company_seo?.og_description, seoArray.og_description) ||
    hasChangedPair(check_company_seo?.twitter_title, seoArray.twitter_title) ||
    hasChangedPair(check_company_seo?.twitter_description, seoArray.twitter_description)

  if (changed) {
    await seo_change_logsM.create({
      module_key: 'company',
      module_id: companyRowId,
      old_meta_title: check_company_seo?.meta_title || '',
      new_meta_title: hasChangedPair(check_company_seo?.meta_title, seoArray.meta_title) ? seoArray.meta_title : '',
      old_meta_description: check_company_seo?.meta_description || '',
      new_meta_description: hasChangedPair(check_company_seo?.meta_description, seoArray.meta_description) ? seoArray.meta_description : '',
      old_meta_keywords: check_company_seo?.meta_keywords || '',
      new_meta_keywords: hasChangedPair(check_company_seo?.meta_keywords, seoArray.meta_keywords) ? seoArray.meta_keywords : '',
      old_og_title: check_company_seo?.og_title || '',
      new_og_title: hasChangedPair(check_company_seo?.og_title, seoArray.og_title) ? seoArray.og_title : '',
      old_og_description: check_company_seo?.og_description || '',
      new_og_description: hasChangedPair(check_company_seo?.og_description, seoArray.og_description) ? seoArray.og_description : '',
      old_twitter_title: check_company_seo?.twitter_title || '',
      new_twitter_title: hasChangedPair(check_company_seo?.twitter_title, seoArray.twitter_title) ? seoArray.twitter_title : '',
      old_twitter_description: check_company_seo?.twitter_description || '',
      new_twitter_description: hasChangedPair(check_company_seo?.twitter_description, seoArray.twitter_description) ? seoArray.twitter_description : '',
      user_type: auditActorType,
      updated_by: auditActorId,
    })
  }

  await invalidateBasicDetailsCaches()
  await upsertCompanySeoDetails({ company_row_id: companyRowId, seoArray })
  await calculateCompanyProfileScore(companyRowId, ['basic', 'team_detail'])
}

/**
 * Ports setting.js's POST /update_new_basic_company_details (lines 651-889) — the API-key-only
 * "team panel" variant of the route above.
 *
 * CONFIRMED BUG FIX (Part 3 §7 Phase G): the real source is unreachable past validation on
 * every call — it references an undeclared `checkUserToken` at two points (checking
 * `.message.user_type == 2` and passing it to `getUpdateTrackerFields`), a `ReferenceError`
 * always thrown before any success path completes. This route has no login-token check at all
 * (`checkApiKey` only) and requires `user_row_id` directly in the body (validated required) —
 * there is no admin/sub-admin caller path possible here (no admin-id field exists anywhere in
 * this route's own body schema), so the fix constructs a synthetic actor shaped exactly like
 * `checkAllLoginToken`'s normalized output for an app-user caller (`user_type: 1`), matching
 * what `getUpdateTrackerFields` already expects (confirmed by reading its implementation) and
 * making the dead `user_type == 2` branch correctly never fire (consistent with the vestigial,
 * unreachable-by-validation `sub_admin_row_id` else-branch already present in the source).
 * Also fixes two copy-paste bugs: `user_row_id`/`sub_admin_row_id` were both parsed from
 * `req.body.company_row_id` instead of `req.body.user_row_id` (lines 676/683). Also adds the
 * cache invalidation this route never had at all (its sibling above has 11 calls; this one had
 * zero) — a confirmed cache-invalidation gap, same class as the ones fixed in Phase B.
 */
export async function saveOrUpdateBasicCompanyDetailsTeamPanel({ body, preValidationErrors }: SaveBasicCompanyDetailsTeamPanelParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }
  let company_row_id = 0

  const user_row_id = Number.parseInt(body.user_row_id ?? '')
  const actor: Actor = { status: true, message: { user_type: 1, user_row_id } }

  const check_company_res = await findApprovedLoggedInProfessional(user_row_id)
  if (!check_company_res) {
    errObj['alert_message'] = 'Your profile is currently under approval. Please wait, while the admin approves your profile.'
  }

  if (body.company_row_id) {
    if (!Number.isNaN(Number.parseInt(body.company_row_id))) {
      const check_company_row_res = await checkCompanyRowID({ company_row_id: Number.parseInt(body.company_row_id), user_row_id })
      if (!check_company_row_res.status) {
        errObj['alert_message'] = check_company_row_res.message.alert_message
      } else {
        company_row_id = Number.parseInt(body.company_row_id)
      }
    }
  }

  if (!company_row_id) {
    const check_user_company_query = await findCompanyByUserRowId(user_row_id)
    if (check_user_company_query) {
      errObj['alert_message'] = 'Sorry, a company has already been created for your user account'
    }
  }

  if (!company_row_id && user_row_id) {
    const check_company_res2 = await checkCompanyRowID({ company_row_id: 0, user_row_id })
    if (check_company_res2.status) {
      errObj['alert_message'] = 'Sorry, a company has already been created for your user account.'
    }
  }

  if (body.company_id) {
    const check_company_id_query = await findCompanyByCompanyIdExcluding({ company_row_id, company_id: sanitize(body.company_id) })
    if (check_company_id_query) {
      errObj['company_id'] = 'The Company ID is already in use.'
    }
  }

  if (body.company_email_id) {
    const check_email_id_query = await findCompanyByEmailExcluding({ company_row_id, company_email_id: sanitize(body.company_email_id) })
    if (check_email_id_query) {
      errObj['company_email_id'] = 'The Company Email ID is already in use.'
    }
  }

  if (body.contact_number) {
    if (body.contact_number.match(/[^0-9\-(\)\s]/)) {
      errObj['contact_number'] = 'The Contact Number field cannot have speacial charaters.'
    }
    const check_mobile_number_query = await findCompanyByContactNumberExcluding({ company_row_id, contact_number: sanitize(body.contact_number) })
    if (check_mobile_number_query) {
      errObj['contact_number'] = 'The Contact Number is already in use.'
    }
  }

  let business_model_id: number[] = []
  if (body.business_model_id && body.business_model_id.length > 0) {
    const business_model_id_array = await Promise.resolve(getIntIdFromArray(body.business_model_id))
    if (business_model_id_array.length > 0) {
      business_model_id = business_model_id_array
    } else {
      errObj['business_model_id'] = 'The Business Model Ids field must be integer in object'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const date_n_time = getPresentDateTime()
  const insertArray: CompanyInsertPayload = {
    business_model_id,
    main_business_model_id: body.main_business_model_id,
    company_name: body.company_name,
    company_id: (body.company_id as string).toLowerCase(),
    company_email_id: body.company_email_id,
    contact_number: body.contact_number,
    website_link: body.website_link,
    describe_in_one_line: body.describe_in_one_line,
    established_in: body.established_in,
    company_valuation: body.company_valuation,
    company_size_row_id: body.company_size_row_id,
    investor_category_row_id: body.investor_category_row_id,
    country_id: body.country_id,
    company_location: body.company_location,
    city: body.city ? body.city : '',
    state: body.state ? body.state : '',
    longitude: body.longitude ? body.longitude : '',
    latitude: body.latitude ? body.latitude : '',
    updated_date_n_time: date_n_time,
    nft_wallet_address: body.nft_wallet_address ? (body.nft_wallet_address as string).trim() : '',
    about_company: body.about_company,
  }
  const seoArray: CompanySeoUpdatePayload = { meta_keywords: body.meta_keywords, meta_description: body.meta_description, meta_title: body.meta_title }
  const socialArray: CompanySocialLinksPayload = { youtube_channel: body.youtube_channel }

  if (!company_row_id) {
    insertArray['user_row_id'] = user_row_id
    insertArray['created_date_n_time'] = date_n_time

    const saveCompanyDetails = await companyM(insertArray).save()
    seoArray['company_row_id'] = saveCompanyDetails._id
    socialArray['company_row_id'] = saveCompanyDetails._id

    await company_seo_detailsM(seoArray).save()
    await company_social_linksM(socialArray).save()
    await invalidateBasicDetailsCaches()

    await updateThreadNotification({
      user_row_id: -1,
      notify_type: 2,
      notify_type_row_id: saveCompanyDetails._id,
      message_row_id: 9,
      action_row_id: saveCompanyDetails._id,
    })

    if (!Number.isNaN(Number.parseInt(body.manual_company_row_id ?? ''))) {
      const manual_company_row_id = Number.parseInt(body.manual_company_row_id ?? '')
      const check_manual_query = await findManualCompanyById(manual_company_row_id)
      if (check_manual_query) {
        await shiftCompanyFromManualToRegister({ manual_company_row_id, register_company_row_id: saveCompanyDetails._id, sub_admin_row_id: 0 })
      }
    }

    const sub_admin_data = await sub_admin_emailsM.find({ type: { $in: [2, 3] } }, { full_name: 1, email_id: 1 })
    const user_query = await findProfessionalFullName(user_row_id)
    await notifySubAdminsOfNewCompany(sub_admin_data, {
      full_name: user_query!.full_name,
      company_name: saveCompanyDetails.company_name,
      updated_date_n_time: saveCompanyDetails.updated_date_n_time,
    })

    return { status: true, message: { alert_message: 'Your company details have been updated successfully. Thank you for keeping your company information current!' } }
  }

  const check_company_status = await findCompanyApprovalStatus(company_row_id)
  if (check_company_status!.approval_status === 2) {
    insertArray['approval_status'] = 0
  }

  Object.assign(insertArray, getUpdateTrackerFields(actor))
  await updateCompanyBasicDetails({ company_row_id, insertArray })
  await upsertCompanySeoDetails({ company_row_id, seoArray })
  await upsertCompanySocialLinks({ company_row_id, socialArray })
  await invalidateBasicDetailsCaches()

  return { status: true, message: { alert_message: 'Your company details have been successfully resubmitted. Thank you for keeping your company information current!' } }
}

export interface CompanySocialLinksPayload {
  company_row_id?: number
  facebook?: string
  twitter?: string
  linkedin?: string
  instagram?: string
  video_link?: string
  telegram?: string
  youtube_channel?: string
  medium?: string
  reddit?: string
  feed_url?: string
  other_social_links?: string
  // Index signature so this structurally satisfies upsertCompanySocialLinks/
  // updateCompanySocialLinks' generic Record<string, unknown> Mongo $set parameter.
  [key: string]: unknown
}

export interface CompanySocialDetailsBody {
  company_row_id?: string
  user_row_id?: string
  feed_url?: string
  facebook?: string
  twitter?: string
  linkedin?: string
  video_link?: string
  instagram?: string
  telegram?: string
  reddit?: string
  medium?: string
  youtube_channel?: string
  other_social_links?: string
}

export interface SaveSocialDetailsParams {
  actor: Actor
  body: CompanySocialDetailsBody
  preValidationErrors: Record<string, string>
}

/** Ports setting.js's POST /update_social_details (lines 892-967). */
export async function saveOrUpdateSocialDetails({ actor, body, preValidationErrors }: SaveSocialDetailsParams) {
  if (!actor.status) {
    return { status: false, message: { alert_message: actor.message, test: 'dsaf' } }
  }

  const errObj: Record<string, string> = { ...preValidationErrors }
  let user_row_id = 0
  let company_row_id = 0

  if (actor.message.user_type == 1) {
    user_row_id = actor.message.user_row_id
  }

  if (body.company_row_id) {
    if (!Number.isNaN(Number.parseInt(body.company_row_id))) {
      company_row_id = Number.parseInt(body.company_row_id)
      const check_event_res = await checkCompanyRowID({ company_row_id, user_row_id })
      if (!check_event_res.status) {
        errObj['alert_message'] = check_event_res.message.alert_message
      }
    }
  }

  if (!(body.feed_url || body.facebook || body.twitter || body.linkedin || body.video_link || body.instagram || body.telegram || body.reddit || body.medium || body.youtube_channel || body.other_social_links)) {
    errObj['alert_message'] = 'Please submit atleast one social media details.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const socialFields = {
    facebook: body.facebook,
    twitter: body.twitter,
    linkedin: body.linkedin,
    instagram: body.instagram,
    video_link: body.video_link,
    telegram: body.telegram,
    youtube_channel: body.youtube_channel,
    medium: body.medium,
    reddit: body.reddit,
    feed_url: body.feed_url,
    other_social_links: body.other_social_links,
  }

  // Publish gate applies to admin-panel edits only (design §2), same branch shape as
  // updateCompanySeo. A company owner editing their own profile keeps writing live immediately.
  const isSocialCompanyOwner = Number(actor.message.user_type) === USER_TYPE_COMPANY_OWNER
  if (!isSocialCompanyOwner) {
    const liveValues = (await findCompanySocialLinksLean(company_row_id)) ?? {}
    const actorRowId = Number(actor.message.user_row_id)
    return submitChangeRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_SOCIAL_MEDIA,
      rootDocumentId: company_row_id,
      targetRowId: null,
      liveValues,
      submitted: socialFields,
      actor: toActorRefWithId(
        {
          updated_by: actorRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: actorRowId,
        },
        actorRowId,
      ),
    })
  }

  const insert_object: CompanySocialLinksPayload = { ...socialFields }

  // Captured before the create/update branch writes, so the owner-path change-log diff below
  // compares against the pre-write state. Reading it again after the write would compare the
  // new value against itself and silently report zero changes.
  const preWriteSocialValues = (await findCompanySocialLinksLean(company_row_id)) ?? {}

  const check_query = await findCompanySocialLinksId(company_row_id)
  let social_links_key_deleted
  if (check_query) {
    await updateCompanySocialLinks({ company_row_id, insert_object })
    // CONFIRMED, PRESERVED ASYMMETRY (Part 3 §7 Phase G, flagged not fixed): the real source
    // only invalidates this cache on the UPDATE branch, never on INSERT (a first-time save has
    // nothing stale to invalidate anyway, so this is harmless, not a functional bug).
    await invalidateSocialDetailsCache()
    social_links_key_deleted = true
  } else {
    insert_object['company_row_id'] = company_row_id
    await company_social_linksM(insert_object).save()
  }

  // Owner edits are not gated but must still appear in the shared timeline (same reasoning as
  // updateCompanySeo's owner-path log write).
  const ownerSocialChanges = await computeDiff({
    before: preWriteSocialValues,
    submitted: socialFields,
    schemaPaths: (field: string) => company_social_linksM.schema.path(field),
    editableFields: OWNER_SOCIAL_MEDIA_EDITABLE_FIELDS,
  })
  if (ownerSocialChanges.length > 0) {
    try {
      await insertChangeLog({
        module: AUDIT_MODULE_COMPANY,
        target_collection: 'cln_company_social_links',
        target_row_id: company_row_id,
        root_document_id: company_row_id,
        section: SECTION_SOCIAL_MEDIA,
        action: 'update',
        actor: toActorRefWithId({ updated_by: 'user', updated_by_row_id: actor.message.user_row_id }, actor.message.user_row_id),
        changes: ownerSocialChanges,
        reason: null,
        snapshot: null,
      })
    } catch (err) {
      logger.error({ err, company_row_id }, 'company.settings: owner social links change log write failed')
    }
  }

  await calculateCompanyProfileScore(company_row_id, ['social_media'])

  return { status: true, message: { alert_message: 'Your company social media details have been successfully updated.' }, social_links_key_deleted }
}

export interface SaveSocialMediaDetailsTeamPanelParams {
  body: CompanySocialDetailsBody
  preValidationErrors: Record<string, string>
}

/** Ports setting.js's POST /update_social_media_details (lines 972-1038) — API-key-only team-panel variant. */
export async function saveOrUpdateSocialMediaDetailsTeamPanel({ body, preValidationErrors }: SaveSocialMediaDetailsTeamPanelParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }
  const user_row_id = Number.parseInt(body.user_row_id ?? '')
  let company_row_id = 0

  if (body.company_row_id) {
    if (!Number.isNaN(Number.parseInt(body.company_row_id))) {
      company_row_id = Number.parseInt(body.company_row_id)
      const check_event_res = await checkCompanyRowID({ company_row_id, user_row_id })
      if (!check_event_res.status) {
        errObj['alert_message'] = check_event_res.message.alert_message
      }
    }
  }

  if (!(body.feed_url || body.facebook || body.twitter || body.linkedin || body.video_link || body.instagram || body.telegram || body.reddit || body.medium || body.youtube_channel || body.other_social_links)) {
    errObj['alert_message'] = 'Please submit atleast one social media details.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const insert_object: CompanySocialLinksPayload = {
    facebook: body.facebook,
    twitter: body.twitter,
    linkedin: body.linkedin,
    instagram: body.instagram,
    video_link: body.video_link,
    telegram: body.telegram,
    youtube_channel: body.youtube_channel,
    medium: body.medium,
    reddit: body.reddit,
    feed_url: body.feed_url,
    other_social_links: body.other_social_links,
  }

  const check_query = await findCompanySocialLinksId(company_row_id)
  if (check_query) {
    await updateCompanySocialLinks({ company_row_id, insert_object })
  } else {
    insert_object['company_row_id'] = company_row_id
    await company_social_linksM(insert_object).save()
  }

  return { status: true, message: { alert_message: 'Your company social media details have been successfully updated.' } }
}

/**
 * Ports setting.js's getCompanyData() (lines 1134-1437) verbatim — shared by both
 * GET /individual_details (app-user/admin, self-scoped) and GET /individual_company_details
 * (API-key-only team panel, no ownership check needed since the caller already resolved
 * `company_row_id` via checkCompanyRowID before calling this).
 */
/**
 * Ports the admin "Individual Company Details" popup's team-members table
 * (components/company_individual_details.js tab 2) — reuses
 * getAdminCompanyEmployeeList (Part 3 §7 Phase H step 8) rather than a bespoke
 * pipeline. Field mapping notes (this popup's exact backend contract never
 * existed anywhere in the codebase before this fix — these are the closest
 * real equivalents, not a restore of prior behavior):
 *  - `date_n_time` (the popup's "Date and Time" column) has no direct
 *    equivalent on a team-member record; mapped from `start_date` (closest
 *    available "when this happened" field) rather than `verified_on`, since a
 *    member can appear in this list before verification.
 *  - `approval_status` here means the opposite of what the name suggests
 *    elsewhere in this codebase (the popup's own JS: `== 1` renders "Pending",
 *    anything else renders "Verified") — mapped from the real `verified_status`
 *    boolean: `false` -> 1 (Pending), `true` -> 2 (Verified).
 *  - `work_position` is the popup's fallback display string when `positions[]`
 *    is empty; mapped from `position_name`.
 */
async function getAdminTeamMembersListForPopup(companyRowId: number) {
  const { get_query } = await getAdminCompanyEmployeeList({ company_row_id: companyRowId, skip: 0, limit: 1000 })
  return get_query.map((m: any) => ({
    ...m,
    work_position: m.position_name,
    date_n_time: m.start_date,
    approval_status: m.verified_status ? 2 : 1,
  }))
}

/**
 * Ports the admin popup's Revenue tab (tab 5) — reuses getRevenueListAdmin
 * (Part 3 §7 Phase D step 3) directly; the only adaptation is aliasing
 * `updated_date_n_time` to the popup's expected `date_n_time` key.
 */
async function getRevenueDetailsForPopup(companyRowId: number) {
  const { list } = await getRevenueListAdmin({ companyRowId })
  return list.map((r: any) => ({ date_n_time: r.updated_date_n_time, year: r.year, quarter: r.quarter, revenue: r.revenue }))
}

/**
 * Ports the admin popup's Fund Raised tab (tab 3) — reuses
 * getFundsRaisedListAdmin (Part 3 §7 Phase H step 9), which returns
 * ROUND-grouped rows (one round, many investors[]); this popup's table is
 * flat (one row per investor), so each round is flattened here.
 *
 * `added_by_type` (the popup's "was this self-listed by the company, or
 * added on the investor's behalf" distinction) has NO backing field anywhere
 * in the funding schema — there is no way to know who actually submitted a
 * given round. Defaulting every row to `1` ("Self-listed") rather than
 * inventing a specific "added by" identity that the data cannot support —
 * the columns that ARE backed by real data (investor identity, amount,
 * category, date) are populated correctly.
 */
async function getFundingListForPopup(companyRowId: number) {
  const { list } = await getFundsRaisedListAdmin({ funds_raised_company_row_id: companyRowId, skip: 0, limit: 1000, query: {} })
  const rows: any[] = []
  for (const round of list) {
    for (const inv of round.investors ?? []) {
      rows.push({
        announcement_date: round.announcement_date,
        category_name: round.category_name,
        amount: round.amount,
        added_by_type: 1,
        account_type: inv.investor_type,
        investor_registered_type: inv.investor_registered_type,
        manual_name: inv.investor_name,
        manual_email_id: inv.investor_email_id,
        manual_image: inv.investor_image,
      })
    }
  }
  return rows
}

/**
 * Ports the admin popup's Fund Invested tab (tab 4) — this company acting AS
 * AN INVESTOR into others. Reuses getInvestorList (Part 3 §7 Phase B) scoped
 * to investor_type:2 (company), investor_row_id: this company. Same
 * `added_by_type` caveat as getFundingListForPopup above — no backing field,
 * defaulted to 1 ("Self-listed").
 */
async function getInvestingListForPopup(companyRowId: number) {
  const { list } = await getInvestorList({ investor_type: 2, investor_row_id: companyRowId, skip: 0, limit: 1000, query: {} })
  return list.map((item: any) => ({
    announcement_date: item.announcement_date,
    added_by_type: 1,
    company_name: item.company_name,
    company_id: item.company_id,
    company_logo: item.company_logo,
    company_email_id: item.company_email_id,
    investor_registered_type: item.funds_raised_registered_type,
    category_name: item.category_name,
    amount: item.amount,
  }))
}

/**
 * Ports the admin popup's "Create By" line (top of tab 1) — the professionalsM/
 * sub_adminM contact-lookup aggregates from the retired legacy
 * view_individual_details route (controllers/admin_panel/app/company.js,
 * Part 3 §7 Phase H step 10), which this popup still needs but the app-facing
 * getCompanyIndividualDetailsData response never carried.
 */
async function getCreatorContactInfoForPopup(userRowId: number, subAdminRowId: number) {
  const contact: Record<string, string> = {}

  if (userRowId) {
    const [userInfo] = await aggregateProfessionalContactInfo(userRowId)
    contact.user_full_name = userInfo?.full_name ?? ''
    contact.user_username = userInfo?.user_name ?? ''
    contact.user_mobile_number = userInfo?.mobile_number ?? ''
    contact.user_email_id = userInfo?.email_id ?? ''
    contact.user_wallet_address = userInfo?.wallet_address ?? ''
    contact.user_country_name = userInfo?.country_name ?? ''
  }

  if (subAdminRowId) {
    const [subAdminInfo] = await aggregateSubAdminContactInfo(subAdminRowId)
    contact.sub_admin_full_name = subAdminInfo?.full_name ?? ''
    contact.sub_admin_username = subAdminInfo?.user_name ?? ''
    contact.sub_admin_mobile_number = subAdminInfo?.mobile_number ?? ''
    contact.sub_admin_email_id = subAdminInfo?.email_id ?? ''
    contact.sub_admin_wallet_address = subAdminInfo?.wallet_address ?? ''
    contact.sub_admin_country_name = subAdminInfo?.country_name ?? ''
  }

  return contact
}

export async function getCompanyIndividualDetailsData({ company_row_id, includeAdminExtras }: { company_row_id: number; includeAdminExtras?: boolean }) {
  try {
    const get_query_array = await runIndividualDetailsAggregate(company_row_id)

    if (!get_query_array[0]) {
      return { status: false, message: { alert_message: 'Sorry, Invalid company row id' } }
    }
    const get_query = get_query_array[0]
    const companyRowId = get_query._id as number

    const result: Record<string, any> = {
      _id: get_query._id,
      user_row_id: get_query.user_row_id,
      company_name: get_query.company_name,
      company_id: get_query.company_id,
      company_email_id: get_query.company_email_id,
      company_location: get_query.company_location,
      city: get_query.city ? get_query.city : '',
      state: get_query.state ? get_query.state : '',
      longitude: get_query.longitude ? get_query.longitude : '',
      latitude: get_query.latitude ? get_query.latitude : '',
      contact_number: get_query.contact_number,
      website_link: get_query.website_link,
      describe_in_one_line: get_query.describe_in_one_line,
      established_in: get_query.established_in,
      main_business_model_id: get_query.main_business_model_id,
      business_model_id: await Promise.resolve(getIntIdFromArray(get_query.business_model_id as unknown[])),
      approval_status: get_query.approval_status,
      active_status: get_query.active_status,
      updated_date_n_time: get_query.updated_date_n_time,
      company_logo: get_query.company_logo,
      feed_url: get_query.feed_url,
      reason_rejected: get_query.reason_rejected,
      rejected_date_n_time: get_query.rejected_date_n_time,
      disable_reason: get_query.disable_reason,
      disabled_date_n_time: get_query.disabled_date_n_time,
      nft_wallet_address: get_query.nft_wallet_address,
      sub_admin_row_id: get_query.sub_admin_row_id,
      claim_status: get_query.claim_status,
      company_valuation: get_query.company_valuation,
      company_size_row_id: get_query.company_size_row_id,
      investor_category_row_id: get_query.investor_category_row_id,
      email_verify_status: get_query.email_verify_status ? get_query.email_verify_status : false,
      country_id: get_query.country_id,
      country_sortname: get_query.sortname,
      country_code: get_query.country_code,
      country_name: get_query.country_name,
      country_flag: get_query.country_flag,
      country_mobile_id: get_query.country_mobile_id,
      about_company: get_query.about_company,
      total_employees: get_query.total_employees,
      meta_keywords: get_query.meta_keywords,
      meta_description: get_query.meta_description,
      meta_title: get_query?.meta_title,
      facebook: get_query.facebook,
      twitter: get_query.twitter,
      linkedin: get_query.linkedin,
      instagram: get_query.instagram,
      video_link: get_query.video_link,
      telegram: get_query.telegram,
      medium: get_query.medium,
      reddit: get_query.reddit,
      other_social_links: get_query.other_social_links,
      youtube_channel: get_query.youtube_channel,
      business_models_categories: get_query.business_models_categories,
      main_business_name: get_query.main_business_name,
      investor_category_name: get_query.investor_category_name,
      created_admin_row_id: get_query.created_admin_row_id,
      created_by_type: get_query.created_by_type,
      basic_details_score: get_query?.basic_details_score,
      seo_details_score: get_query?.seo_details_score,
      social_media_score: get_query?.social_media_score,
      team_detail_score: get_query?.team_detail_score,
      owned_product_score: get_query?.owned_product_score,
      job_opening_score: get_query?.job_opening_score,
      funding_score: get_query?.funding_score,
      revenue_score_score: get_query?.revenue_score_score,
      investment_score: get_query?.investment_score,
      holding_crypto_score: get_query?.holding_crypto_score,
      profile_score: get_query?.profile_score,
      faq_score: get_query?.faq_score,
    }

    result['profile_completed_percentage'] = await company_profile_completed_percentage(result)

    const check_partner_status_query = await findPartnerStatus(companyRowId)
    result['partner_status'] = Boolean(check_partner_status_query)

    // PERF FIX: this only produces a count, so the $sort served no purpose (order is
    // discarded by $count regardless) — dropped. The login_status:1 filter now runs inside
    // the $lookup's own sub-pipeline, so Mongo filters during the join instead of joining
    // every follower's full user document first and filtering afterward; $unwind is no
    // longer needed since the lookup pipeline already narrows each follower to at most one
    // matching user, so "array non-empty" is equivalent to "the previous $elemMatch matched".
    const queryFollowers = await aggregateCompanyFollowersCount(companyRowId)
    result['total_followers'] = queryFollowers.length > 0 ? queryFollowers[0].count : 0

    if (includeAdminExtras) {
      const [teamMembersList, revenueDetails, fundingList, investingList, creatorContact] = await Promise.all([
        getAdminTeamMembersListForPopup(companyRowId),
        getRevenueDetailsForPopup(companyRowId),
        getFundingListForPopup(companyRowId),
        getInvestingListForPopup(companyRowId),
        getCreatorContactInfoForPopup(get_query.user_row_id as number, get_query.sub_admin_row_id as number),
      ])
      result['team_members_list'] = teamMembersList
      result['revenue_details'] = revenueDetails
      result['funding_list'] = fundingList
      result['investing_list'] = investingList
      Object.assign(result, creatorContact)
    }

    return { status: true, message: result }
  } catch (err: any) {
    return { status: false, message: { alert_message: 'Sorry, Invalid company row id ' + err.message } }
  }
}

export interface GetIndividualDetailsParams {
  actor: Actor
  queryCompanyRowId?: string
  /**
   * Opt-in only - see fetchCompanyIndividualDetails's (frontend) own doc comment. The admin EDIT
   * form passes this so resubmitting untouched fields never reverts an already-pending edit; a
   * read-only VIEW surface must leave it false/omitted so it only ever shows genuinely live data,
   * never a preview of something approved but not yet published.
   */
  includePendingOverlay?: boolean
}

/** Ports setting.js's GET /individual_details (lines 1042-1086) — app-user/admin, self-scoped. */
export async function getIndividualDetails({ actor, queryCompanyRowId, includePendingOverlay }: GetIndividualDetailsParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, string> = {}
  let user_row_id = 0
  let company_row_id = 0

  if (actor.message.user_type == 1) {
    user_row_id = actor.message.user_row_id
  } else if (!queryCompanyRowId) {
    errObj['alert_message'] = 'The company row id field is required.'
  } else if (!Number.isNaN(Number.parseInt(queryCompanyRowId))) {
    company_row_id = Number.parseInt(queryCompanyRowId)
  } else {
    errObj['faq_row_id'] = 'The company row id field must be contain valid number.'
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
  if (!check_company.status) {
    return { status: false, message: { alert_message: check_company.message.alert_message, sdf: 3 } }
  }

  const resolvedCompanyRowId = check_company.message.company_row_id as number
  const result = await getCompanyIndividualDetailsData({
    company_row_id: resolvedCompanyRowId,
    includeAdminExtras: actor.message.user_type === 2,
  })

  // Admin edit-context only (includePendingOverlay, opt-in - see this param's own doc comment):
  // overlay any already-pending basic_details/social_media change request's payload onto the live
  // values this endpoint otherwise returns unconditionally. Without this, the admin editor's forms
  // (BasicDetailsForm, SocialMediaForm) hydrate purely from live data even when a field is already
  // pending review - and since both forms resubmit their ENTIRE current state on every save (not
  // just the touched fields), the next unrelated edit on the same section would silently resend
  // the stale live value for every OTHER field too, reverting an already-pending edit back toward
  // live the moment that request is approved. Gated behind the opt-in flag (not just user_type===2)
  // because the read-only company VIEW page uses this SAME endpoint and must never show an
  // approved-but-unpublished change as if it were already live - that would mislead a reviewer into
  // thinking publish already happened (confirmed report: approving a change made it "look live" on
  // the view page despite publish being a deliberate separate action).
  if (includePendingOverlay && actor.message.user_type === 2 && result.status) {
    await overlayPendingSectionPayloads(result.message as Record<string, unknown>, resolvedCompanyRowId)
  }

  return result
}

/** See getIndividualDetails's own comment on why this overlay exists. */
async function overlayPendingSectionPayloads(details: Record<string, unknown>, companyRowId: number): Promise<void> {
  const [pendingBasicDetails, pendingSocialMedia] = await Promise.all([
    findPendingRequest({ module: AUDIT_MODULE_COMPANY, rootDocumentId: companyRowId, section: SECTION_BASIC_DETAILS }),
    findPendingRequest({ module: AUDIT_MODULE_COMPANY, rootDocumentId: companyRowId, section: SECTION_SOCIAL_MEDIA }),
  ])
  if (pendingBasicDetails?.payload) Object.assign(details, pendingBasicDetails.payload)
  if (pendingSocialMedia?.payload) Object.assign(details, pendingSocialMedia.payload)
}

/** Ports setting.js's GET /individual_company_details/:user_row_id (lines 1089-1131) — API-key-only team panel. */
export async function getIndividualDetailsTeamPanel({ queryCompanyRowId }: { queryCompanyRowId?: string }) {
  const errObj: Record<string, string> = {}
  let company_row_id = 0

  if (!queryCompanyRowId) {
    errObj['alert_message'] = 'The company row id field is required.'
  } else if (!Number.isNaN(Number.parseInt(queryCompanyRowId))) {
    company_row_id = Number.parseInt(queryCompanyRowId)
  } else {
    errObj['faq_row_id'] = 'The company row id field must be contain valid number.'
  }

  if (Object.keys(errObj).length) {
    return { status: false, message: errObj }
  }

  const check_company = await checkCompanyRowID({ company_row_id })
  if (!check_company.status) {
    return { status: false, message: { alert_message: check_company.message.alert_message } }
  }

  return getCompanyIndividualDetailsData({ company_row_id: check_company.message.company_row_id })
}

export interface UpdateCompanyLogoParams {
  actor: Actor
  body: { company_row_id?: any; company_logo?: string }
}

/** Ports setting.js's POST /update_company_logo (lines 1457-1538). */
export async function updateCompanyLogo({ actor, body }: UpdateCompanyLogoParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, string> = {}
  let company_row_id = 0

  if (!Number.isNaN(Number.parseInt(body.company_row_id))) {
    company_row_id = Number.parseInt(body.company_row_id)
    if (actor.message.user_type == 1) {
      const user_row_id = actor.message.user_row_id
      const check_company = await checkCompanyRowID({ company_row_id, user_row_id })
      if (!check_company.status) {
        errObj['company_row_id'] = check_company.message.alert_message
      }
    }
  } else {
    errObj['company_row_id'] = 'The Company Row ID field is required.'
  }

  let company_logo: string | number = 0
  if (!body.company_logo) {
    errObj['company_logo'] = 'The Company Logo field is required.'
  } else if (body.company_logo.length < 100) {
    errObj['company_logo'] = 'The Company Logo field must be at least 100 characters in length.'
  } else {
    const validate_n_save_image = await validateAndSaveImage(body.company_logo, 1)
    if (!validate_n_save_image.status) {
      errObj['company_logo'] = 'Sorry, Invalid profile image.'
    } else {
      company_logo = validate_n_save_image.webp_file_name
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const queryRun = await findCompanyLogo(company_row_id)
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Please update your company details.' } }
  }

  if (queryRun.company_logo) {
    await deleteImageDigitalOcean(queryRun.company_logo, 1)
  }
  const updateFields = getUpdateTrackerFields(actor)
  await updateCompanyLogoFields({ company_row_id, company_logo, updateFields })
  await invalidateCompanyLogoCaches()

  return { status: true, message: { alert_message: 'Company logo updated successfully..!' } }
}

export interface RemoveCompanyLogoParams {
  actor: Actor
  queryCompanyRowId?: any
}

/** Ports setting.js's GET /remove_company_logo (lines 1540-1607). */
export async function removeCompanyLogo({ actor, queryCompanyRowId }: RemoveCompanyLogoParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, string> = {}
  let company_row_id = 0
  let company_logo = ''
  let check_company: any = ''

  if (queryCompanyRowId) {
    if (!Number.isNaN(Number.parseInt(queryCompanyRowId))) {
      company_row_id = Number.parseInt(queryCompanyRowId)
      let user_row_id = 0
      if (actor.message.user_type == 1) {
        user_row_id = actor.message.user_row_id
      }
      check_company = await checkCompanyRowID({ company_row_id, user_row_id })
      if (!check_company.status) {
        errObj['company_row_id'] = check_company.message.alert_message
      } else if (!check_company.message.company_logo) {
        errObj['alert_message'] = 'Sorry, For this company the company logo is not updated.'
      } else {
        company_logo = check_company.message.company_logo
      }
    }
  } else {
    errObj['company_row_id'] = 'The Company Row ID field is required.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  if (company_logo) {
    await deleteImageDigitalOcean(company_logo, 1)
    const updateFields = getUpdateTrackerFields(actor)
    await updateCompanyLogoFields({ company_row_id, company_logo: '', updateFields })
    // CONFIRMED BUG FIX (Part 3 §7 Phase G): the real source's closing brace was misplaced, so
    // one cache-invalidation call (`professional_detail_list_*`) ran unconditionally even when
    // there was no logo to remove. Fixed by scoping the whole invalidation call inside this
    // `if (company_logo)` block, matching the intent of every other pattern here.
    await invalidateCompanyLogoCaches()
  }

  return { status: true, message: { check_company, company_logo, company_row_id, alert_message: 'Company logo is removed successfully..!' } }
}

export interface FollowCompanyParams {
  checkUserToken: { status: boolean; message: any }
  followingCompanyRowIdRaw: string
}

/** Ports setting.js's GET /follow/:following_company_row_id (lines 1609-1692). */
export async function followCompany({ checkUserToken, followingCompanyRowIdRaw }: FollowCompanyParams) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const following_company_row_id = Number.parseInt(followingCompanyRowIdRaw)
  if (Number.isNaN(following_company_row_id)) {
    return { status: false, message: { alert_message: 'Invalid company row id' } }
  }

  const date_n_time = getPresentDateTime()
  const user_row_id = checkUserToken.message

  const queryList = await findFollowerRecord({ company_row_id: following_company_row_id, user_row_id })
  if (queryList) {
    return { status: false, message: { alert_message: 'Sorry, Your already following this company' } }
  }

  const check_company = await findActiveApprovedCompany(following_company_row_id)
  if (!check_company) {
    return { status: false, message: { alert_message: 'Invalid company row id' } }
  }

  const insertArray = new followersM({ company_row_id: following_company_row_id, user_row_id, date_n_time })
  await insertArray.save()
  await invalidateFollowCaches()

  const following_user_name_query = await findProfessionalById(user_row_id)
  const following_user_name = following_user_name_query!.full_name

  const getCompany = await findCompanyById(following_company_row_id)
  const total_following = await countCompanyFollowersDocs(following_company_row_id)

  if (getCompany?.company_email_id) {
    const pass_email_id = getCompany.company_email_id
    const pass_subject = 'Heya! You have a New Follower.'
    const pass_full_name = getCompany.company_name
    const pass_message = `<div>
                                <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hi ${pass_full_name},</p>
                                <div style="color:#000">
                                    <p style="color:#000;font-weight: 400;font-size:17px;"><b style="text-transform: capitalize;">${following_user_name}</b> Started Following you on the Coinpedia pro account profile. </p>
                                    <p style="line-height: 1.8;color:#000;font-weight: 400;font-size:17px;">Your total followers are ${total_following}. </p>
                                    <p><a href="https://app.coinpedia.org/login/" style="color:#0029ff;font-weight: 400;font-size:17px;">Login to know more.</a> </p>
                                </div>
                                </div>`
    await sendEmail(pass_email_id, pass_subject, pass_message)
  }

  return { status: true, message: { alert_message: ' You have successfully followed the company. Thank you for your involvement!' } }
}

export interface UnfollowCompanyParams {
  checkUserToken: { status: boolean; message: any }
  followingCompanyRowIdRaw: string
}

/** Ports setting.js's GET /unfollow/:following_company_row_id (lines 1696-1740). */
export async function unfollowCompany({ checkUserToken, followingCompanyRowIdRaw }: UnfollowCompanyParams) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const following_company_row_id = Number.parseInt(followingCompanyRowIdRaw)
  if (Number.isNaN(following_company_row_id)) {
    return { status: false, message: { alert_message: 'Invalid company row id' } }
  }

  const user_row_id = checkUserToken.message
  const queryRun = await findFollowerRecord({ company_row_id: following_company_row_id, user_row_id })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Already removed..' } }
  }

  await deleteCompanyFollowers({ type: 1, company_row_id: following_company_row_id, user_row_id })
  await invalidateFollowCaches(user_row_id)

  return { status: true, message: { alert_message: 'This company has been successfully removed from your following list.' } }
}

export interface RemoveFollowerParams {
  checkUserToken: { status: boolean; message: any }
  followerUserRowIdRaw: string
}

/** Ports setting.js's GET /remove_follower/:follower_user_row_id (lines 1742-1785). */
export async function removeFollower({ checkUserToken, followerUserRowIdRaw }: RemoveFollowerParams) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const company_user_row_id = Number.parseInt(checkUserToken.message)
  const company_query = await findCompanyIdByUserRowId(company_user_row_id)
  if (!company_query) {
    return { status: false, message: { alert_message: 'Sorry,This user not listed any company' } }
  }

  const company_row_id = company_query._id
  const follower_user_row_id = Number.parseInt(followerUserRowIdRaw)
  if (Number.isNaN(follower_user_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid User row id' } }
  }

  const queryRun = await findFollowerRecord({ company_row_id, user_row_id: follower_user_row_id })
  if (!queryRun) {
    return { status: false, message: { alert_message: 'Already removed..' } }
  }

  await deleteCompanyFollowers({ type: 1, company_row_id, user_row_id: follower_user_row_id })
  await invalidateRemoveFollowerCaches()

  return { status: true, message: { alert_message: 'The user has been successfully removed from your followers. Thank you for your action!' } }
}

/** Ports setting.js's GET /company_followers/:company_row_id (lines 1787-1888) — public, cached. */
export async function getCompanyFollowersList({ companyRowIdRaw }: { companyRowIdRaw: string }) {
  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: true, message: { alert_message: 'Invalid company row id' } }
  }

  const key = buildCompanyFollowersKey(company_row_id)
  const cache_response = await getCache({ key })
  if (cache_response.status) {
    return { status: true, message: cache_response.message, cache_reponse_status: true }
  }

  const get_query = await runCompanyFollowersAggregate(company_row_id)
  await setCache({ key, value: get_query, ttl: 1800 })

  return { status: true, message: get_query, cache_reponse_status: false }
}

/**
 * Ports setting.js's GET /company_wallet_address_list (lines 1890-1915).
 *
 * PORTED AS-IS PER EXPLICIT DIRECTION, even though no consumer was found in either
 * frontend-appcp-typescript or admin-coinpedia for this route or add_company_wallet_address
 * below (grepped both repos for `company_wallet_address_list`/`add_company_wallet_address` —
 * zero matches). Confirmed with the user during Phase G planning: port faithfully in case a
 * client outside these two repos depends on it, same caution as Claim Flow B.
 */
export async function getCompanyWalletAddressList({ checkUserToken }: { checkUserToken: { status: boolean; message: any } }) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const user_row_id = checkUserToken.message
  const getCompany = await findCompanyIdByUserRowId(user_row_id)
  if (!getCompany) {
    return { status: false, message: { alert_message: 'Sorry, This user did not register company.' } }
  }

  const queryRun = await company_wallet_addressM.find({ company_row_id: getCompany._id }).limit(3)
  return { status: true, message: queryRun }
}

export interface AddCompanyWalletAddressParams {
  checkUserToken: { status: boolean; message: any }
  body: { wallet_address?: string; nick_name?: string }
  preValidationErrors: Record<string, string>
}

/** Ports setting.js's POST /add_company_wallet_address (lines 1917-1976). No remove route exists in the real source — preserved as-is, not added here (a real, pre-existing gap, not this step's scope to fill). */
export async function addCompanyWalletAddress({ checkUserToken, body, preValidationErrors }: AddCompanyWalletAddressParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  if (!checkUserToken.status) {
    return checkUserToken
  }

  const user_row_id = checkUserToken.message
  const getCompany = await findCompanyIdByUserRowId(user_row_id)
  if (!getCompany) {
    return { status: false, message: { alert_message: 'Sorry, this user did not register Company' } }
  }

  const company_row_id = getCompany._id
  const wallet_address = (sanitize(body.wallet_address) as string).toLowerCase()

  if (user_row_id) {
    const checkWalletAddress = await findWalletAddress({ wallet_address, company_row_id })
    if (checkWalletAddress) {
      errObj['wallet_address'] = 'Sorry, This Wallet Address already exists.'
    }

    const checkWalletAddLimitQuery = await company_wallet_addressM.find({ company_row_id })
    if (checkWalletAddLimitQuery.length >= 3) {
      errObj['alert_message'] = 'Sorry, maximun wallet addresses limit reached.'
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const insertArray = new company_wallet_addressM({ company_row_id, nick_name: body.nick_name, wallet_address, date_n_time: getPresentDateTime() })
  await insertArray.save()

  return { status: true, message: { alert_message: 'Your company wallet Address details added successfully.' } }
}

export interface VerifyCompanyEmailOtpParams {
  checkUserToken: { status: boolean; message: any }
  body: { otp_number?: string }
  preValidationErrors: Record<string, string>
}

/** Ports setting.js's POST /verify_company_email_otp (lines 2061-2147). */
export async function verifyCompanyEmailOtp({ checkUserToken, body, preValidationErrors }: VerifyCompanyEmailOtpParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }

  if (!checkUserToken.status) {
    errObj['alert_message'] = checkUserToken.message.alert_message
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const token_res = checkUserToken.message
  const user_row_id = token_res.account_row_id
  const check_email_query = await findVerifyEmailRecord({ user_row_id, email_verify_code: token_res.email_verify_code })
  if (!check_email_query) {
    return { status: false, message: { alert_message: 'Sorry, This token field is expired.' } }
  }

  if (check_email_query.email_otp_number != body.otp_number) {
    return { status: false, message: { otp_number: 'Sorry, Your OTP is not matching' } }
  }

  const rowData = (await findProfessionalById(user_row_id))!
  const resArray: Record<string, any> = {
    token: generateUserLoginToken(user_row_id, 1),
    _id: user_row_id,
    referral_row_id: rowData.referral_row_id,
    referral_user_name: rowData.referral_user_name,
    user_name: rowData.user_name,
    full_name: rowData.full_name,
    email_id: rowData.email_id,
    mobile_number: rowData.mobile_number,
    wallet_address: rowData.wallet_address,
    company_name: rowData.company_name,
    work_position: rowData.work_position,
    login_status: 1,
    approval_status: rowData.approval_status,
    created_date_n_time: rowData.created_date_n_time,
    company_listed_status: 0,
    email_verify_status: true,
  }

  const query = await findApprovedActiveCompanyByUser(user_row_id)
  resArray['company_listed_status'] = query ? 1 : 0

  const imageQueryRun = await findProfessionalProfileImage(user_row_id)
  resArray['profile_image'] = imageQueryRun ? imageQueryRun.profile_image : ''

  await clearVerifyEmailOtp(user_row_id)

  return { status: true, message: resArray }
}

/** Ports setting.js's GET /send_email_otp (lines 2152-2199). */
export async function sendEmailOtp({ checkUserToken }: { checkUserToken: { status: boolean; message: any } }) {
  if (!checkUserToken.status) {
    return checkUserToken
  }

  const user_row_id = checkUserToken.message
  const user_query = await findVerifiedLoggedInProfessional(user_row_id)
  if (!user_query) {
    return { status: false, message: { alert_message: 'Your User Account email is not verified, please verify & update company email verify status.' } }
  }

  const company_query = await findCompanyEmailVerifyInfo(user_row_id)
  if (!company_query) {
    return { status: false, message: { alert_message: 'Sorry, we are not any related your account, please update your company details' } }
  }

  if (company_query.email_verify_status) {
    return { status: false, message: { alert_message: 'Sorry, Your company account is already verified' } }
  }

  const verify_otp = randomstring.generate({ length: 6, charset: '123456789' })
  await updateCompanyEmailVerifyOtp({ user_row_id, verify_otp })

  const pass_email_id = company_query.company_email_id
  const pass_subject = verify_otp + ' is OTP to verify your coinpedia company profile account.'
  const full_name = user_query.full_name
  const pass_message = `<p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${full_name},</p>
                        <p style="color:#000;font-weight: 400;font-size:17px;"><b>${verify_otp}</b> is your OTP for email verification number to verify your coinpedia <b>${company_query.company_name}</b> company profile account. </p>
                        <p style="color:#000;font-weight: 400;font-size:17px;">Please verify your company email for the quick process for account claiming.</p>`
  await sendEmail(pass_email_id, pass_subject, pass_message)

  return { status: true, message: { alert_message: 'We sent an OTP to your company email, please verify email.' } }
}

export interface UpdateCompanySeoParams {
  actor: Actor
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

/** Ports setting.js's POST /update_company_seo (lines 2201-2352). */
export async function updateCompanySeo({ actor, body, preValidationErrors }: UpdateCompanySeoParams) {
  if (Object.keys(preValidationErrors).length > 0) {
    return { status: false, message: preValidationErrors }
  }
  if (!actor.status) {
    return actor
  }

  const {
    module_id, meta_title, meta_description, meta_keywords, robots_index, robots_follow,
    twitter_creator, og_title, og_description, twitter_title, twitter_description,
  } = body

  const condition: Record<string, any> = { _id: Number(module_id) }
  if (actor.message.user_type == 1) {
    condition.user_row_id = actor.message.user_row_id
  }

  const companyData = await findCompanyByCondition(condition)
  if (!companyData) {
    return { status: false, message: { alert_message: 'Invalid Company ID.' } }
  }

  const seoFields = {
    meta_title, meta_description, meta_keywords, robots_index, robots_follow,
    twitter_creator, og_title, og_description, twitter_title, twitter_description,
  }

  // Publish gate applies to admin-panel edits only (design §2). A company owner editing their
  // own profile keeps writing live immediately, exactly as before.
  const isCompanyOwner = Number(actor.message.user_type) === USER_TYPE_COMPANY_OWNER
  if (!isCompanyOwner) {
    const liveValues = (await findCompanySeoDetailsLean(Number(module_id))) ?? {}
    const actorRowId = Number(actor.message.user_row_id)
    return submitChangeRequest({
      module: AUDIT_MODULE_COMPANY,
      section: SECTION_SEO,
      rootDocumentId: Number(module_id),
      targetRowId: null,
      liveValues,
      submitted: seoFields,
      actor: toActorRefWithId(
        {
          updated_by: actorRowId === ADMIN_ROW_ID_MAIN_ADMIN ? 'admin' : 'subadmin',
          updated_by_row_id: actorRowId,
        },
        actorRowId,
      ),
    })
  }

  const checkQuery = await findCompanySeoDetailsRaw(condition._id as number)

  const seoChanged =
    meta_title !== checkQuery?.meta_title ||
    meta_description !== checkQuery?.meta_description ||
    meta_keywords !== checkQuery?.meta_keywords ||
    og_title !== checkQuery?.og_title ||
    og_description !== checkQuery?.og_description ||
    twitter_title !== checkQuery?.twitter_title ||
    twitter_description !== checkQuery?.twitter_description ||
    robots_index !== checkQuery?.robots_index ||
    robots_follow !== checkQuery?.robots_follow ||
    twitter_creator !== checkQuery?.twitter_creator

  if (seoChanged) {
    // Was `user_type == 1 ? 'user' : 'admin'`, always collapsing subadmin into 'admin' in
    // this audit log - same fix as saveOrUpdateBasicCompanyDetails's two seo_change_logsM
    // writes above.
    const seoMetaLogTrackerFields = getUpdateTrackerFields(actor)
    await seo_change_logsM.create({
      module_key: 'company',
      module_id,
      old_meta_title: checkQuery?.meta_title || '',
      new_meta_title: meta_title === checkQuery?.meta_title ? '' : meta_title,
      old_meta_description: checkQuery?.meta_description || '',
      new_meta_description: meta_description === checkQuery?.meta_description ? '' : meta_description,
      old_meta_keywords: checkQuery?.meta_keywords || '',
      new_meta_keywords: meta_keywords === checkQuery?.meta_keywords ? '' : meta_keywords,
      old_og_title: checkQuery?.og_title || '',
      new_og_title: og_title === checkQuery?.og_title ? '' : og_title,
      old_og_description: checkQuery?.og_description || '',
      new_og_description: og_description === checkQuery?.og_description ? '' : og_description,
      old_twitter_title: checkQuery?.twitter_title || '',
      new_twitter_title: twitter_title === checkQuery?.twitter_title ? '' : twitter_title,
      old_twitter_description: checkQuery?.twitter_description || '',
      new_twitter_description: twitter_description === checkQuery?.twitter_description ? '' : twitter_description,
      old_robots_index: checkQuery?.robots_index || '',
      new_robots_index: robots_index === checkQuery?.robots_index ? '' : robots_index,
      old_robots_follow: checkQuery?.robots_follow || '',
      new_robots_follow: robots_follow === checkQuery?.robots_follow ? '' : robots_follow,
      old_twitter_creator: checkQuery?.twitter_creator || '',
      new_twitter_creator: twitter_creator === checkQuery?.twitter_creator ? '' : twitter_creator,
      user_type: seoMetaLogTrackerFields.updated_by ?? 'admin',
      updated_by: seoMetaLogTrackerFields.updated_by_row_id ?? 0,
    })
  }

  const updateData = { meta_title, meta_description, meta_keywords, robots_index, robots_follow, twitter_creator, og_title, og_description, twitter_title, twitter_description }
  const updateResult = await upsertCompanySeoData({ company_row_id: Number(module_id), updateData })

  if (!updateResult.acknowledged || (updateResult.matchedCount === 0 && !updateResult.upsertedCount)) {
    return { status: false, message: { alert_message: 'Company SEO details could not be saved. Please try again.' } }
  }

  // Company-owner edits are not gated (design §2 — only admin-panel edits go through
  // change_requests), but they must still appear in the shared timeline: without this, an
  // owner's edit is invisible to cln_change_logs while every admin submit/publish is recorded.
  // Reuses the same computeDiff engine as the admin-panel path rather than a second comparison.
  // findCompanySeoDetailsRaw is typed Record<string, unknown> | null (its return type is shared
  // with other Record-shaped callers), but at runtime it is the live Mongoose document
  // findCompanySeoDetailsRaw's own implementation returns — hence the narrowing cast to reach
  // .toObject() rather than diffing against Mongoose internals directly.
  const checkQueryDoc = checkQuery as { toObject(): Record<string, unknown> } | null
  const ownerChanges = await computeDiff({
    before: checkQueryDoc ? checkQueryDoc.toObject() : {},
    submitted: seoFields,
    schemaPaths: (field: string) => company_seo_detailsM.schema.path(field),
    editableFields: OWNER_SEO_EDITABLE_FIELDS,
  })
  if (ownerChanges.length > 0) {
    try {
      await insertChangeLog({
        module: AUDIT_MODULE_COMPANY,
        target_collection: 'cln_company_seo_details',
        target_row_id: Number(module_id),
        root_document_id: Number(module_id),
        section: SECTION_SEO,
        action: 'update',
        actor: toActorRefWithId({ updated_by: 'user', updated_by_row_id: actor.message.user_row_id }, actor.message.user_row_id),
        changes: ownerChanges,
        reason: null,
        snapshot: null,
      })
    } catch (err) {
      logger.error({ err, module_id }, 'company.settings: owner seo change log write failed')
    }
  }

  await invalidateSeoCaches(Number(module_id))
  await calculateCompanyProfileScore(module_id, ['basic'])

  return { status: true, message: { alert_message: 'Company SEO meta details updated successfully' } }
}

export interface GetCompanySeoParams {
  actor: Actor
  companyId?: string
}

/**
 * Ports setting.js's GET /get_company_seo/:company_id (lines 2354-2527) — confirmed the live,
 * canonical implementation (both frontend-appcp-typescript and admin-coinpedia call this path
 * exclusively). A separate, same-shaped implementation in controllers/app/analytics.js at a
 * different, unmounted-by-any-consumer URL is left untouched, not deleted, per the user's
 * direction.
 *
 * Cached (`getCache`/`setCache`, 30 min TTL) — same pattern this file's own
 * `getCompanyFollowersList` already uses, and `invalidateSeoCaches` already had a write-side
 * invalidation call wired up on `updateCompanySeo` with nothing on the read side to actually
 * invalidate; this was the missing half. The cache key encodes `condition` itself (`'admin'` for
 * an unrestricted caller, the caller's own `user_row_id` for a scoped self-service one) rather
 * than just `companyId` alone — the same `companyId` returns different data (or none) depending
 * on who's asking, per the ownership check just above, so keying on `companyId` alone would let
 * one caller's cached result leak to a different, unauthorized caller for the same id.
 */
export async function getCompanySeo({ actor, companyId }: GetCompanySeoParams) {
  if (!companyId) {
    return { status: false, message: { alert_message: 'The Company ID field is required.' } }
  }
  if (!actor.status) {
    return actor
  }

  const condition: Record<string, any> = { _id: Number(companyId) }
  if (actor.message.user_type == 1) {
    condition.user_row_id = actor.message.user_row_id
  }

  const cacheKey = buildCompanySeoKey(Number(companyId), condition.user_row_id ?? 'admin')
  const cache_response = await getCache({ key: cacheKey })
  let seoData: Record<string, unknown>

  if (cache_response.status) {
    seoData = cache_response.message as Record<string, unknown>
  } else {
    const companyData = await runGetCompanySeoAggregate(condition)
    if (!companyData.length) {
      return { status: false, message: { alert_message: 'Invalid Company ID.' } }
    }
    seoData = companyData[0]
    await setCache({ key: cacheKey, value: seoData, ttl: 1800 })
  }

  // Admin-only, applied AFTER the cache (never baked into the cached live value - see
  // getIndividualDetails's own comment for why this overlay exists at all). A fresh object copy
  // so the overlay never mutates whatever was just cached above.
  if (actor.message.user_type === 2) {
    const pendingSeo = await findPendingRequest({ module: AUDIT_MODULE_COMPANY, rootDocumentId: Number(companyId), section: SECTION_SEO })
    if (pendingSeo?.payload) {
      seoData = { ...seoData, ...pendingSeo.payload }
    }
  }

  return { status: true, message: { alert_message: 'Company SEO fetched successfully' }, data: seoData }
}

/**
 * For the logged-in user, the list of company_row_ids they follow. No
 * confirmed frontend caller in either repo audited during this engagement —
 * the one apparent caller found calls a frontend proxy route that doesn't
 * exist, so the request never actually reaches this backend today. Kept live
 * in its natural home (alongside this file's own follow/unfollow/followers
 * routes) rather than a separate "dead code" file — per the FINAL PHASE
 * decision, this route's URL may still be depended on by a consumer outside
 * those two repos.
 */
export const followerIds = async (headers: any) => {
  const checkUserToken = checkUserLoginToken(headers)
  if (checkUserToken.status) {
    const user_row_id = Number.parseInt(checkUserToken.message)

    let followers_id = []
    const total_followers = await followersM.find({ user_row_id: user_row_id }, { company_row_id: 1 })
    if (total_followers) {
      followers_id = await array_column(total_followers, 'company_row_id')
    }

    return { status: true, followers_id: followers_id }
  }
  else {
    return checkUserToken
  }
}
