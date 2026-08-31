// modules/company_admin/company_admin.service.ts
const sub_adminM = require('../../../models/admin_panel/app/sub_adminM')
const companyM = require('../../../models/app/company/companyM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const { getMinusYearDates, checkCompanySubadminAccess, getPresentDateTime, getNewCompanyRowID, checkValidDate, validateAndSaveImage, deleteImageDigitalOcean } = require('../../../utils/helpers/helper')
const { calculateCompanyProfileScore } = require('../../../utils/helpers/app_helper')
import { getUpdateTrackerFields } from '@ultimez-interview/coinpedia-backend-library/auth'
const { updateNotification } = require('../../../utils/helpers/notification_helper')
import { deleteKeysByPattern } from '@ultimez-interview/coinpedia-backend-library/cache'
const eventM = require('../../../models/app/events/eventM')
import {
  buildCompanyEventsCreatedPipeline,
  buildCompanyEventsSponsoredPipeline,
  buildSubadminOverviewPipeline,
  findProfessionalByUserName,
  findCompanyByCompanyId,
  findActiveSubAdminsBrief,
  buildYearsOverviewCountFilter,
  findCompanyById,
  findCompanyByIdWithActiveStatus,
  findActiveProfessionalById,
  updateCompanyFields,
  findCompanyPodcastByCompanyRowId,
  deleteCompanyPodcastByCompanyRowId,
  findEventByCompanyRowId,
  updateEventsActiveStatusByCompanyRowId,
  findCompanyByNameCI,
  findCompanyByEmailCI,
  findCompanyByContactNumber,
  findBusinessModelByNameCI,
  findCountryByNameCI,
  insertCompany,
  insertCompanySeoDetails,
  insertCompanySocialLinks,
  findCompanyLogoById,
  updateCompanyLogo,
} from './company_admin.queries'
import { getNewCompanyYearsOverviewCache, setNewCompanyYearsOverviewCache } from './company_admin.cache'
import { saveOrUpdateBasicCompanyDetails } from '../company/settings/company.settings.service'
import { Actor, BulkCompanyRow, NotInsertedBulkCompanyEntry, CompanyBulkInsertFields, InsertedCompanyRow, YearsOverviewResult } from './company_admin.types'

/**
 * Ports company.js's GET /check_user_company_id/:investor_type/:id (Part 3 §7 Phase H step 10) —
 * confirmed unreachable (no caller found anywhere across admin-coinpedia,
 * frontend-appcp-typescript, or frontend-events-typescript), and the only route in the entire
 * file with no admin-token check at all. Ported with both confirmed bugs fixed:
 *
 * CONFIRMED BUG FIX: the real source queried `companyM.findOne({ comapany_id: req_id })` — a
 * typo'd field name that matches no real schema field (confirmed via companyM's schema, which
 * declares `company_id`, used everywhere else in this same file) — so investor_type=2 always
 * reported "Sorry, Invalid Company ID." regardless of whether the id actually existed. Fixed to
 * query `company_id`.
 */
export async function checkUserOrCompanyIdAvailability({ investor_type, id }: { investor_type: number; id: string }) {
  if (investor_type === 1) {
    const check_user = await findProfessionalByUserName(id)
    return check_user
      ? { status: true, message: { alert_message: 'This User ID is available.' } }
      : { status: false, message: { alert_message: 'Sorry, Invalid User ID.' } }
  }
  if (investor_type === 2) {
    const check_company = await findCompanyByCompanyId(id)
    return check_company
      ? { status: true, message: { alert_message: 'This Company ID is available.' } }
      : { status: false, message: { alert_message: 'Sorry, Invalid Company ID.' } }
  }
  return { status: false, message: { alert_message: 'Sorry, Invalid investor type.' } }
}

/** Ports company.js's GET /subadmin_list (lines 37-46). */
export async function getSubadminList() {
  const message = await findActiveSubAdminsBrief()
  return { status: true, message }
}

export interface GetCompanyEventsListParams {
  companyRowIdRaw: string
}

/** Ports company.js's GET /company_events_list/:company_row_id (lines 48-167). */
export async function getCompanyEventsList({ companyRowIdRaw }: GetCompanyEventsListParams) {
  const companyRowId = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(companyRowId)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid company row id.' } }
  }

  const [created_events, sp_events] = await Promise.all([
    eventM.aggregate(buildCompanyEventsCreatedPipeline({ companyRowId })),
    event_sponsors_partner_detailsM.aggregate(buildCompanyEventsSponsoredPipeline({ companyRowId })),
  ])

  return { status: true, message: { created_events, sp_events } }
}

async function computeYearsOverview(): Promise<YearsOverviewResult> {
  const dateRanges = [0, 1, 2, 3].map((i: number) => getMinusYearDates(i))
  const [present_year_date, one_year_back_date, two_year_back_date, three_year_back_date] = dateRanges

  const [present_year, one_year_back, two_year_back, three_year_back, admin_present_year, admin_one_year_back, admin_two_year_back, admin_three_year_back] = await Promise.all([
    companyM.countDocuments(buildYearsOverviewCountFilter({ gte: new Date(present_year_date.start_date) })),
    companyM.countDocuments(buildYearsOverviewCountFilter({ gte: new Date(one_year_back_date.start_date), lte: new Date(one_year_back_date.end_date) })),
    companyM.countDocuments(buildYearsOverviewCountFilter({ gte: new Date(two_year_back_date.start_date), lte: new Date(two_year_back_date.end_date) })),
    companyM.countDocuments(buildYearsOverviewCountFilter({ gte: new Date(three_year_back_date.start_date), lte: new Date(three_year_back_date.end_date) })),
    companyM.countDocuments(buildYearsOverviewCountFilter({ gte: new Date(present_year_date.start_date), subAdminOnly: true })),
    companyM.countDocuments(buildYearsOverviewCountFilter({ gte: new Date(one_year_back_date.start_date), lte: new Date(one_year_back_date.end_date), subAdminOnly: true })),
    companyM.countDocuments(buildYearsOverviewCountFilter({ gte: new Date(two_year_back_date.start_date), lte: new Date(two_year_back_date.end_date), subAdminOnly: true })),
    companyM.countDocuments(buildYearsOverviewCountFilter({ gte: new Date(three_year_back_date.start_date), lte: new Date(three_year_back_date.end_date), subAdminOnly: true })),
  ])

  return {
    present_year: present_year_date,
    one_year: one_year_back_date,
    two_year: two_year_back_date,
    three_year: three_year_back_date,
    all_present_year: present_year,
    all_one_year_back: one_year_back,
    all_two_year_back: two_year_back,
    all_three_year_back: three_year_back,
    admin_present_year,
    admin_one_year_back,
    admin_two_year_back,
    admin_three_year_back,
    user_present_year: present_year - admin_present_year,
    user_one_year_back: one_year_back - admin_one_year_back,
    user_two_year_back: two_year_back - admin_two_year_back,
    user_three_year_back: three_year_back - admin_three_year_back,
  }
}

/**
 * Ports company.js's GET /years_overview (lines 237-301).
 *
 * CONFIRMED BUG FIX: the real source's `admin_three_year_back_query` filtered on
 * `created_date_n_timee_n_time` (a typo, doubled `e_n_time`) instead of `created_date_n_time` —
 * that clause silently matched nothing, so `admin_three_year_back` (and the derived
 * `user_three_year_back`) was always undercounted. Fixed to the real field name.
 */
export async function getYearsOverview() {
  const message = await computeYearsOverview()
  return { status: true, message }
}

/**
 * Ports company.js's GET /new_company_years_overview (lines 176-236) — kept alongside
 * `years_overview` per the standing "port dead code, don't drop it" decision: no live caller
 * found in either frontend, near-exact duplicate of `years_overview` (this one adds a 120s
 * cache and is gated only by the global `checkApiKey`, no admin-token check). Same confirmed
 * typo bug fixed here too (`admin_one_year_back`/`admin_two_year_back` used
 * `created_date_n_timee_n_time` in the real source).
 */
export async function getNewCompanyYearsOverview() {
  const cache_response = await getNewCompanyYearsOverviewCache()
  if (cache_response.status) {
    return { status: true, message: cache_response.message, cache_reponse_status: true }
  }

  const message = await computeYearsOverview()
  await setNewCompanyYearsOverviewCache(message)
  return { status: true, message, cache_reponse_status: false }
}

/** Ports company.js's GET /subadmin_overview (lines 2218-2269), with the field-name bug fixed in company_admin.queries.ts. */
export async function getSubadminOverview() {
  const message = await sub_adminM.aggregate(buildSubadminOverviewPipeline())
  return { status: true, message }
}

export interface EnableCompanyParams {
  admin: Actor
  companyRowIdRaw: string
}

/** Ports company.js's GET /enable_company/:company_row_id (lines 3592-3688). */
export async function enableCompany({ admin, companyRowIdRaw }: EnableCompanyParams) {
  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }
  }

  const queryRunCheck = await findCompanyById(company_row_id)
  if (!queryRunCheck) {
    return { status: false, message: { alert_message: 'Oops! Invalid Company Row Id' } }
  }

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(String(admin.message.admin_row_id)),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number.parseInt(String(admin.message.sub_admin_type)),
    company_row_id,
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const checkStatus = await findCompanyByIdWithActiveStatus(company_row_id, 0)
  if (!checkStatus) {
    return { status: false, message: { alert_message: 'Sorry! This Company is already enabled' } }
  }

  let user_status = 0
  let check_user_status = null
  if (checkStatus.user_row_id > 0) {
    check_user_status = await findActiveProfessionalById(checkStatus.user_row_id)
    user_status = check_user_status ? 1 : 2
  }

  if (user_status === 2) {
    return { status: false, message: { check_user_status, alert_message: 'Sorry! You need to enable the user before enabling the company' } }
  }

  const updateFields = getUpdateTrackerFields(admin)
  await updateCompanyFields(company_row_id, { active_status: 1, ...updateFields })

  if (queryRunCheck.user_row_id) {
    await updateNotification({ user_row_id: queryRunCheck.user_row_id, notify_type: 2, notify_type_row_id: company_row_id, message_row_id: 15, action_row_id: company_row_id })
  }

  const checkPodcast = await findCompanyPodcastByCompanyRowId(company_row_id)
  if (checkPodcast) {
    await deleteCompanyPodcastByCompanyRowId(company_row_id)
  }

  await deleteKeysByPattern('app_company_list_*')
  await deleteKeysByPattern('app_company_individual_details_*')

  return { status: true, message: { alert_message: 'This company is enabled successfully' } }
}

export interface DisableCompanyParams {
  admin: Actor
  companyRowIdRaw: string
  disableReason: string
}

/** Ports company.js's POST /disable_company/:company_row_id (lines 3690-3780). */
export async function disableCompany({ admin, companyRowIdRaw, disableReason }: DisableCompanyParams) {
  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(String(admin.message.admin_row_id)),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number.parseInt(String(admin.message.sub_admin_type)),
    company_row_id: Number.parseInt(companyRowIdRaw),
  })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  let admin_row_id = 0
  if (admin.message.admin_manager_type == 2) {
    admin_row_id = Number(admin.message.admin_row_id)
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }
  }

  const queryRunCheck = await findCompanyById(company_row_id)
  if (!queryRunCheck) {
    return { status: false, message: { alert_message: 'Oops! Invalid Company Row Id' } }
  }

  const checkStatus = await findCompanyByIdWithActiveStatus(company_row_id, 1)
  if (!checkStatus) {
    return { status: false, message: { alert_message: 'Sorry! This Company is already Disabled' } }
  }

  const updateFields = getUpdateTrackerFields(admin)
  await updateCompanyFields(company_row_id, {
    disable_reason: disableReason,
    disabled_sub_admin_row_id: admin_row_id,
    disabled_date_n_time: getPresentDateTime(),
    active_status: 0,
    ...updateFields,
  })

  const checkEvents = await findEventByCompanyRowId(company_row_id)

  if (queryRunCheck.user_row_id) {
    await updateNotification({ user_row_id: queryRunCheck.user_row_id, notify_type: 2, notify_type_row_id: company_row_id, message_row_id: 16, action_row_id: company_row_id })
  }

  if (checkEvents) {
    await updateEventsActiveStatusByCompanyRowId(company_row_id, 0)
  }

  await deleteKeysByPattern('app_company_list_*')
  await deleteKeysByPattern('app_company_individual_details_*')

  return { status: true, message: { alert_message: 'This Company is Disabled successfully' } }
}

export interface BulkImportCompaniesParams {
  admin: Actor
  bulkData: BulkCompanyRow[]
}

/** Ports company.js's POST /company_bulk_data (lines 2274-2446). */
export async function bulkImportCompanies({ admin, bulkData }: BulkImportCompaniesParams) {
  let admin_row_id = 0
  if (admin.message.admin_manager_type === 2) {
    admin_row_id = Number(admin.message.admin_row_id)
  }

  if (!bulkData) {
    return { status: false, message: { companies: 'The companies field is required.' } }
  }
  if (!Array.isArray(bulkData)) {
    return { status: false, message: { companies: 'The companies field must be contain valid array format of data.' } }
  }
  if (!bulkData[0]) {
    return { status: true, message: { not_inserted_array: [], alert_message: 'Companies list details has been submitted successfully.' } }
  }
  if (!(bulkData[0].company_name && bulkData[0].main_category && bulkData[0].about_company)) {
    return { status: false, message: { companies: 'The companies data field such as company_name, main_category and description.' } }
  }

  const not_inserted_array: NotInsertedBulkCompanyEntry[] = []

  for (const run of bulkData) {
    if (!(run.company_name && run.main_category && run.about_company)) {
      not_inserted_array.push({ message: 'The company name, main category, and description fiels are required.', data: run })
      continue
    }
    if (run.company_name.length < 4) {
      not_inserted_array.push({ message: 'The company name field name must be contain 4 charecters in length.', data: run })
      continue
    }

    let insert_status = true
    const check_name_query = await findCompanyByNameCI(run.company_name)
    if (check_name_query) {
      insert_status = false
    }

    const insert_array: Partial<CompanyBulkInsertFields> = {}
    if (run.company_email_id) {
      const check_email_query = await findCompanyByEmailCI(run.company_email_id)
      if (check_email_query) {
        insert_status = false
      } else {
        insert_array.company_email_id = run.company_email_id.toLowerCase()
      }
    }

    if (run.contact_number) {
      const check_contact_number_query = await findCompanyByContactNumber(run.contact_number)
      if (check_contact_number_query) {
        insert_status = false
      } else {
        insert_array.contact_number = run.contact_number
      }
    }

    if (!insert_status) {
      not_inserted_array.push({ message: 'Company name, Email ID or contact number is already exist.', data: run })
      continue
    }

    const company_name = run.company_name
    const check_category_query = await findBusinessModelByNameCI(run.main_category ?? '')
    if (check_category_query) {
      insert_array.main_business_model_id = check_category_query._id
      // CONFIRMED BUG FIX (live testing, 2026-08-03): the real source only ever set
      // main_business_model_id, never business_model_id. The admin list's category filter
      // (category_status) checks a $lookup keyed on business_model_id, not main_business_model_id
      // — so every bulk-uploaded company looked like it had no category to that filter, even
      // though its own Primary Category displayed correctly. Set both, matching how a
      // single-category selection looks when made through the real create/edit form.
      insert_array.business_model_id = [check_category_query._id]
    }

    const check_country_query = await findCountryByNameCI(run.country_name ?? '')
    if (check_country_query) {
      insert_array.country_id = check_country_query._id
    }

    const company_id = await getNewCompanyRowID(company_name)
    insert_array.company_name = company_name
    insert_array.company_id = company_id
    insert_array.facebook = run.facebook || ''
    insert_array.twitter = run.twitter || ''
    insert_array.linkedin = run.linkedin || ''
    insert_array.instagram = run.instagram || ''
    insert_array.video_link = run.video_link || ''
    insert_array.telegram = run.telegram || ''
    insert_array.medium = run.medium || ''
    insert_array.reddit = run.reddit || ''
    insert_array.updated_date_n_time = getPresentDateTime()
    insert_array.created_date_n_time = getPresentDateTime()
    insert_array.website_link = run.website_link || ''

    const check_date = checkValidDate(run.established_in)
    if (check_date.status) {
      insert_array.established_in = check_date.message
    }

    insert_array.youtube_channel = run.youtube_channel_id || ''
    insert_array.contact_number = run.contact_number || ''
    insert_array.describe_in_one_line = run.describe_in_one_line || ''
    insert_array.company_location = run.company_location || ''
    insert_array.sub_admin_row_id = admin_row_id
    insert_array.claim_status = 1
    insert_array.bulk_upload_status = 1
    insert_array.user_row_id = 0
    insert_array.about_company = run.about_company || ''

    const inserted_query: InsertedCompanyRow = await insertCompany(insert_array)
    const company_row_id = inserted_query._id

    await insertCompanySeoDetails({
      company_row_id,
      meta_title: run.meta_title || '',
      meta_keywords: run.meta_keywords || '',
      meta_description: run.meta_description || '',
      robots_index: run.robots_index || 'index',
      robots_follow: run.robots_follow || 'follow',
      og_title: run.og_title || '',
      og_description: run.og_description || '',
      twitter_title: run.twitter_title || '',
      twitter_description: run.twitter_description || '',
      twitter_creator: run.twitter_creator || '',
    })

    await insertCompanySocialLinks({
      company_row_id,
      facebook: run.facebook || '',
      twitter: run.twitter || '',
      linkedin: run.linkedin || '',
      instagram: run.instagram || '',
      video_link: run.video_link || '',
      telegram: run.telegram || '',
      medium: run.medium || '',
      reddit: run.reddit || '',
      other_social_links: run.other_social_links || '',
      youtube_channel: run.youtube_channel_id || '',
      feed_url: run.feed_url || '',
    })

    // CONFIRMED BUG FIX (live testing, 2026-08-03): the real source never computed a profile
    // score for bulk-created companies at all, unlike every other create path
    // (saveOrUpdateBasicCompanyDetails calls this on create). Full recalculation (no
    // fieldsToUpdate argument) is correct here since this is a brand-new company with no prior
    // scores to preserve.
    await calculateCompanyProfileScore(company_row_id)
  }

  return { status: true, message: { not_inserted_array, alert_message: 'Companies list details has been submitted successfully.' } }
}

export interface UpdateCompanyPageDetailsParams {
  /** Raw checkAdminLoginToken result — used only for the sub-admin-access check below. */
  admin: Actor
  /** Normalized checkAllLoginToken result — reuses saveOrUpdateBasicCompanyDetails's own `actor` param type. */
  actor: Parameters<typeof saveOrUpdateBasicCompanyDetails>[0]['actor']
  companyRowIdRaw: string
  body: Record<string, string>
  preValidationErrors: Record<string, string>
}

/**
 * Ports company.js's POST /update_company_page_details/:company_row_id (Part 3 §7 Phase H
 * step 6). Keeps only this route's genuinely admin-specific concerns — the sub-admin-access
 * check (now the shared `checkCompanySubadminAccess` helper, not the real source's own buggy
 * inline copy) and the company_logo upload (which saveOrUpdateBasicCompanyDetails doesn't
 * handle) — and delegates the actual basic-details update (name, id, email, contact, website,
 * description, location, business models, about_company, uniqueness checks, SEO
 * auto-generation, profile score recalculation, cache invalidation) to the existing,
 * already-correct `saveOrUpdateBasicCompanyDetails` in modules/company/.
 *
 * CONFIRMED BUG FIX: the real source referenced `company_other_detailsM` for about_company,
 * total_employees, and meta_* — a variable that is `require()`'d nowhere in the entire
 * codebase (confirmed by a full-repo search, and confirmed present in the very first backup of
 * this file taken before this engagement touched it, so not a regression introduced here).
 * Every real call to this route has always thrown a ReferenceError at that line — meaning the
 * basic company details (name, email, business models, etc.) DID save via the earlier
 * `companyM.updateOne()`, but the request then crashed and reported failure to the admin,
 * every single time. Delegating about_company/meta_* to saveOrUpdateBasicCompanyDetails (which
 * already writes them correctly, to `companyM.about_company` and `company_seo_detailsM`) both
 * fixes this crash and eliminates the duplicate, always-broken storage path entirely, rather
 * than patching it. `total_employees` has no established correct schema home anywhere in the
 * codebase (the same standing gap already flagged for `seo_overview`, deferred to a product
 * decision) — it is no longer written at all, rather than reintroducing the crash to preserve
 * a field that was never actually being persisted.
 *
 * Preserves the real source's "accumulate every validation error together" UX: the sub-admin-
 * access check and company_logo validation are merged into `preValidationErrors` before
 * delegating, so saveOrUpdateBasicCompanyDetails's own uniqueness/business_model_id checks
 * still surface alongside them in one response, exactly like the original combined errObj.
 */
export async function updateCompanyPageDetails({ admin, actor, companyRowIdRaw, body, preValidationErrors }: UpdateCompanyPageDetailsParams) {
  const errObj: Record<string, string> = { ...preValidationErrors }
  const company_row_id = Number.parseInt(companyRowIdRaw)

  if (Number.isNaN(company_row_id)) {
    // Early return, unlike the merged-error pattern below: an invalid company_row_id here
    // means saveOrUpdateBasicCompanyDetails would treat this as "no company_row_id" and fall
    // into its INSERT branch instead of UPDATE — never worth risking, and this route's
    // company_row_id always comes from an established URL param, not free-form user input.
    return { status: false, message: { ...errObj, company_row_id: 'The Company row id should be an integer' } }
  }

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(String(admin.message.admin_row_id)),
    admin_manager_type: admin.message.admin_manager_type,
    sub_admin_type: Number.parseInt(String(admin.message.sub_admin_type)),
    company_row_id,
  })
  if (!check_access.status) {
    errObj['created_by_sub_admin_id'] = check_access.message
  }

  let company_logo = ''
  if (body.company_logo) {
    const validate_n_save_image = await validateAndSaveImage(body.company_logo, 1)
    if (!validate_n_save_image.status) {
      errObj['company_logo'] = 'Sorry, Invalid Company Logo.'
    } else {
      company_logo = validate_n_save_image.webp_file_name
    }
  }

  const result = await saveOrUpdateBasicCompanyDetails({ actor, body: { ...body, company_row_id: companyRowIdRaw }, preValidationErrors: errObj })

  if (result.status && company_logo) {
    const checkCompany = await findCompanyLogoById(company_row_id)
    if (checkCompany?.company_logo) {
      await deleteImageDigitalOcean(checkCompany.company_logo, 1)
    }
    await updateCompanyLogo(company_row_id, company_logo)
  }

  return result
}
