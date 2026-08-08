// modules/company_manual/company_manual.service.ts
const sanitize = require('mongo-sanitize')
const { getPresentDateTime, validateAndSaveImage } = require('../../utils/helpers/helper')
const companyM = require('../../models/app/company/companyM')
const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
const professionals_work_experienceM = require('../../models/app/professionals_work_experienceM')
const event_sponsors_partner_detailsM = require('../../models/app/events/event_sponsors_partner_detailsM')
const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
const { deleteUserFunding, deleteProfessionalDetails } = require('../../utils/helpers/app_helper')
const { deleteSponsorsPartners } = require('../../utils/helpers/events_helper')
import {
  buildManualCompanySearchConditions,
  buildPendingListPipeline,
  buildRejectedListPipeline,
  buildApprovedListPipeline,
  buildIndividualDetailPipeline,
  buildManualCompanyEmployeeListPipeline,
  buildManualCompanySponsorListPipeline,
  buildManualCompanyPartnerListPipeline,
} from './company_manual.queries'
import { extractPaginatedResult } from '../common/common.pagination'
import { invalidateManualCompanyListCache } from './company_manual.cache'

interface AdminActor {
  status: boolean
  message: any
}

// ─── App-side ───────────────────────────────────────────────────────────────

export interface AddManualCompanyDetailsParams {
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

/**
 * Ports manual_company.js's POST /update_manual_detail (lines 12-119) — no authentication check
 * in the real source (matches as-is, not a gap introduced here).
 *
 * CONFIRMED BUG FIX (resolved with the user): the real source computed `used_counts` via
 * `findOne({used_counts:1})` — an arbitrary existing manual-company record, not a real counter
 * tied to the record being created. A new record now starts at 0; it's incremented at the real
 * "usage" sites instead — see the funding/sponsor/partner/team-member add flows that select an
 * EXISTING manual company. The identical bug pattern still exists untouched in
 * controllers/app/users/manual_users.js (professionals module, out of scope here).
 */
export async function addManualCompanyDetails({ body, preValidationErrors }: AddManualCompanyDetailsParams) {
  const errObj: Record<string, any> = { ...preValidationErrors }

  let company_name = ''
  if (body.company_name) {
    company_name = sanitize(body.company_name)
    const check_company_query = await companyM.findOne({ company_name }).collation({ locale: 'en', strength: 2 })
    if (check_company_query) {
      errObj['company_name'] = 'Sorry, This Company Name is already exist.'
    } else {
      const check_manual_company_query = await company_manual_retrievalsM.findOne({ company_name }).collation({ locale: 'en', strength: 2 })
      if (check_manual_company_query) {
        errObj['company_name'] = 'Sorry, This Company Name is already exist.'
      }
    }
  }

  let company_email_id = ''
  if (body.company_email_id) {
    company_email_id = sanitize(body.company_email_id).toLowerCase()
    const check_company_query = await companyM.findOne({ company_email_id }).collation({ locale: 'en', strength: 2 })
    if (check_company_query) {
      errObj['company_email_id'] = 'Sorry, This Company Email ID is already exist.'
    } else {
      const check_manual_company_query = await company_manual_retrievalsM.findOne({ company_email_id }).collation({ locale: 'en', strength: 2 })
      if (check_manual_company_query) {
        errObj['company_email_id'] = 'Sorry, This Company Email ID is already exist.'
      }
    }
  }

  let website_link = ''
  if (body.website_link) {
    website_link = sanitize(body.website_link).toLowerCase()
    const check_company_query = await companyM.findOne({ website_link }).collation({ locale: 'en', strength: 2 })
    if (check_company_query) {
      errObj['website_link'] = 'Sorry, This Website Link is already exist.'
    } else {
      const check_link_query = await company_manual_retrievalsM.findOne({ website_link }).collation({ locale: 'en', strength: 2 })
      if (check_link_query) {
        errObj['website_link'] = 'Sorry, This Website Link is already exist.'
      }
    }
  }

  let company_logo = ''
  if (Object.keys(errObj).length === 0 && body.company_logo) {
    const validate_n_save_image = await validateAndSaveImage(body.company_logo, 7)
    if (!validate_n_save_image.status) {
      errObj['company_logo'] = 'Sorry, Invalid Profile Image.'
    } else {
      company_logo = validate_n_save_image.webp_file_name
    }
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const date_n_time = getPresentDateTime()
  const insert_query = await new company_manual_retrievalsM({
    company_name,
    company_email_id,
    company_logo,
    created_from_type: Number.isFinite(Number.parseInt(body.created_from_type)) ? Number.parseInt(body.created_from_type) : 1,
    website_link,
    used_counts: 0,
    created_on: date_n_time,
    updated_on: date_n_time,
  }).save()

  await invalidateManualCompanyListCache()

  return { status: true, message: { manual_data: insert_query, alert_message: 'The manual company details has been listed successfully.' } }
}

export interface EditManualCompanyLogoParams {
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

/**
 * Ports manual_company.js's POST /edit_manual_detail (lines 125-183).
 *
 * CONFIRMED BUG FIX (requirements.md Phase G step 3): the real source could leave the request
 * hanging with no response at all in 3 states — missing/invalid company_row_id, a company_row_id
 * that doesn't exist, and (the one that most needed a decision) an existing record with NO prior
 * logo, which fell through a `if (check_manual_query.company_logo)` gate with no else and no
 * response. There's no separate designed behavior anywhere in the source for that third state, so
 * the gate itself — which only let this "edit logo" endpoint work on a record that ALREADY had a
 * logo — is dropped: the same validate-and-save logic now runs whenever the record exists,
 * regardless of whether it had a prior logo, which is what a reasonable "edit the logo" endpoint
 * should do. Every state now returns a response. (Zero frontend consumers found for this route,
 * so this carries no live-traffic risk.)
 */
export async function editManualCompanyLogo({ body, preValidationErrors }: EditManualCompanyLogoParams) {
  const errObj: Record<string, any> = { ...preValidationErrors }

  const company_row_id = Number.parseInt(body.company_row_id)
  if (Number.isNaN(company_row_id)) {
    errObj['company_row_id'] = 'Sorry, Invalid manual user row id.'
    return { status: false, message: errObj }
  }

  const check_manual_query = await company_manual_retrievalsM.findOne({ _id: company_row_id })
  if (!check_manual_query) {
    errObj['company_row_id'] = 'Sorry, Invalid manual user row id.'
    return { status: false, message: errObj }
  }

  let company_logo = ''
  if (body.company_logo) {
    const validate_n_save_image = await validateAndSaveImage(body.company_logo, 7)
    if (!validate_n_save_image.status) {
      errObj['company_logo'] = 'Sorry, Invalid Profile Image.'
    } else {
      company_logo = validate_n_save_image.webp_file_name
    }
  } else {
    errObj['company_logo'] = 'The company logo field is required.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  await company_manual_retrievalsM.updateOne({ _id: company_row_id }, { $set: { company_logo } })
  const get_manual_query = await company_manual_retrievalsM.findOne({ _id: company_row_id })
  await invalidateManualCompanyListCache()

  return { status: true, message: { manual_data: get_manual_query, alert_message: 'The manual company details has been listed successfully.' } }
}

// ─── Admin-side ─────────────────────────────────────────────────────────────

export interface GetManualCompanyListParams {
  actor: AdminActor
  skipRaw: string
  limitRaw: string
  search?: string
  createdFromType?: number
  rejectType?: number
}

/** Ports manual_retrievals.js's GET /pending_list/:skip/:limit (lines 17-74), $facet-converted. */
export async function getPendingManualCompanies({ actor, skipRaw, limitRaw, search, createdFromType }: GetManualCompanyListParams) {
  if (!actor.status) {
    return actor
  }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  const matchQuery = { $and: [{ approval_status: 0 }, ...buildManualCompanySearchConditions({ search, createdFromType })] }
  const aggregateOutput = await company_manual_retrievalsM.aggregate(buildPendingListPipeline({ matchQuery, skip, limit }))
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

/**
 * Ports manual_retrievals.js's GET /rejected_list/:skip/:limit (lines 76-163), $facet-converted.
 *
 * CONFIRMED CACHE-INVALIDATION FIX: the real source invalidated 'app_company_list_*' here, on
 * every read — moved to rejectManualCompany below (see company_manual.cache.ts).
 */
export async function getRejectedManualCompanies({ actor, skipRaw, limitRaw, search, createdFromType, rejectType }: GetManualCompanyListParams) {
  if (!actor.status) {
    return actor
  }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  const matchQuery = { $and: [{ approval_status: 2 }, ...buildManualCompanySearchConditions({ search, createdFromType, rejectType })] }
  const aggregateOutput = await company_manual_retrievalsM.aggregate(buildRejectedListPipeline({ matchQuery, skip, limit }))
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

/** Ports manual_retrievals.js's GET /approved_list/:skip/:limit (lines 166-271), $facet-converted. */
export async function getApprovedManualCompanies({ actor, skipRaw, limitRaw, search, createdFromType }: GetManualCompanyListParams) {
  if (!actor.status) {
    return actor
  }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  const matchQuery = { $and: [{ approval_status: 1 }, ...buildManualCompanySearchConditions({ search, createdFromType })] }
  const aggregateOutput = await company_manual_retrievalsM.aggregate(buildApprovedListPipeline({ matchQuery, skip, limit }))
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface GetManualCompanyIndividualDetailParams {
  actor: AdminActor
  companyRowIdRaw: string
}

/**
 * Ports manual_retrievals.js's GET /individual_detail/:company_row_id (lines 275-757).
 *
 * CONFIRMED BUG FIX: the real source read get_query[0]._id etc. with no check that a match was
 * found at all — an invalid/nonexistent company_row_id would throw inside the catch block as a
 * generic 500-shaped error instead of a clean not-found response. Added a proper guard.
 */
export async function getManualCompanyIndividualDetail({ actor, companyRowIdRaw }: GetManualCompanyIndividualDetailParams) {
  if (!actor.status) {
    return actor
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  const get_query = await company_manual_retrievalsM.aggregate(buildIndividualDetailPipeline(company_row_id))

  if (!get_query[0]) {
    return { status: false, message: { alert_message: 'Invalid Manual Company Row ID.' } }
  }

  const row = get_query[0]
  const result = {
    _id: row._id,
    company_name: row.company_name,
    company_email_id: row.company_email_id,
    company_logo: row.company_logo,
    website_link: row.website_link,
    used_counts: row.used_counts,
    used_types: row.used_types,
    created_on: row.created_on,
    updated_on: row.updated_on,
    approval_status: row.approval_status,
    approval_date: row.approval_date,
    approval_sub_admin_row_id: row.approval_sub_admin_row_id,
    reject_type: row.reject_type,
    reject_reason: row.reject_reason,
    subadmin_name: row.subadmin_name,
    fund_raised_count: row.fund_raised_count,
    fund_invested_count: row.fund_invested_count,
    team_members_count: row.team_members_count,
  }

  return { status: true, message: result }
}

export interface RejectManualCompanyParams {
  actor: AdminActor
  companyRowIdRaw: string
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

/**
 * Ports manual_retrievals.js's POST /reject_manual_company/:company_row_id (lines 760-822).
 * CONFIRMED CACHE-INVALIDATION FIX: now invalidates the manual-company list cache on success —
 * see company_manual.cache.ts's invalidateManualCompanyListCache doc comment.
 */
export async function rejectManualCompany({ actor, companyRowIdRaw, body, preValidationErrors }: RejectManualCompanyParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, any> = { ...preValidationErrors }

  let admin_row_id = 0
  if (actor.message.admin_manager_type === 2) {
    admin_row_id = actor.message.admin_row_id
  }
  if (Number.parseInt(actor.message.sub_admin_type) == 2) {
    errObj['alert_message'] = 'You do not have permission to perform this action'
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    errObj['company_row_id'] = 'The not fetched token row id field is Invalid.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const present_date_n_time = getPresentDateTime()
  const check_query = await company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: 0 })
  if (!check_query) {
    return { status: false, message: { alert_message: 'Invalid Manual Company Row ID.' } }
  }

  await company_manual_retrievalsM.updateOne(
    { _id: company_row_id },
    { $set: { approval_status: 2, approval_date: present_date_n_time, reject_type: body.reject_type, approval_sub_admin_row_id: admin_row_id, reject_reason: body.reject_reason } },
  )
  await invalidateManualCompanyListCache()

  return { status: true, message: { alert_message: 'This manual company details has been rejected successfully.' } }
}

export interface RevokeManualCompanyParams {
  actor: AdminActor
  companyRowIdRaw: string
}

/** Ports manual_retrievals.js's GET /revoke_manual_company/:company_row_id (lines 824-861). */
export async function revokeManualCompany({ actor, companyRowIdRaw }: RevokeManualCompanyParams) {
  if (!actor.status) {
    return actor
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Invalid Manual Company Row ID' } }
  }

  if (Number.parseInt(actor.message.sub_admin_type) == 2) {
    return { status: false, message: { alert_message: 'You do not have permission to perform this action' } }
  }

  const check_query = await company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: 2 })
  if (!check_query) {
    return { status: false, message: { alert_message: 'Invalid Manual Company Row ID' } }
  }

  await company_manual_retrievalsM.updateOne({ _id: company_row_id, approval_status: 2 }, { $set: { approval_status: 0 } })
  await invalidateManualCompanyListCache()

  return { status: true, message: { alert_message: 'This Manual Company details has been revoked sucessfully.' } }
}

export interface GetManualCompanyEmployeeListParams {
  actor: AdminActor
  companyRowIdRaw: string
  skipRaw: string
  limitRaw: string
}

/** Ports manual_retrievals.js's GET /manual_company_employee_list/:company_row_id/:skip/:limit (lines 864-1193), $facet-converted per the standing list+count fix. */
export async function getManualCompanyEmployeeList({ actor, companyRowIdRaw, skipRaw, limitRaw }: GetManualCompanyEmployeeListParams) {
  if (!actor.status) {
    return actor
  }

  const errObj: Record<string, any> = {}
  if (Number.isNaN(Number.parseInt(companyRowIdRaw))) {
    errObj['company_row_id'] = 'The company row id field must be contain valid number.'
  }
  if (Number.isNaN(Number.parseInt(skipRaw))) {
    errObj['skip'] = 'The parameter skip field must be contain valid number'
  }
  if (Number.isNaN(Number.parseInt(limitRaw))) {
    errObj['limit'] = 'The parameter limit field must be contain valid number.'
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  const skip = Number.parseInt(skipRaw)
  const limit = Number.parseInt(limitRaw)

  const aggregateOutput = await professionals_work_experienceM.aggregate(buildManualCompanyEmployeeListPipeline({ companyRowId: company_row_id, skip, limit }))
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, counts: count }
}

export interface GetManualCompanySponsorOrPartnerListParams {
  actor: AdminActor
  companyRowIdRaw: string
  skipRaw: string
  limitRaw: string
}

function validateSponsorPartnerListParams({ companyRowIdRaw, skipRaw, limitRaw }: Omit<GetManualCompanySponsorOrPartnerListParams, 'actor'>) {
  const errObj: Record<string, any> = {}
  if (Number.isNaN(Number.parseInt(companyRowIdRaw))) {
    errObj['company_row_id'] = 'The company row id field must be contain valid number.'
  }
  if (Number.isNaN(Number.parseInt(skipRaw))) {
    errObj['skip'] = 'The parameter skip field must be contain valid number'
  }
  if (Number.isNaN(Number.parseInt(limitRaw))) {
    errObj['limit'] = 'The parameter limit field must be contain valid number.'
  }
  return errObj
}

/**
 * New — no prior list endpoint existed for a manual company's sponsor appearances (only a
 * registered-company COUNT existed, in modules/partners). Mirrors getManualCompanyEmployeeList's
 * shape/auth/pagination exactly for consistency with this module's other cross-reference tabs.
 */
export async function getManualCompanySponsorList({ actor, companyRowIdRaw, skipRaw, limitRaw }: GetManualCompanySponsorOrPartnerListParams) {
  if (!actor.status) {
    return actor
  }

  const errObj = validateSponsorPartnerListParams({ companyRowIdRaw, skipRaw, limitRaw })
  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  const skip = Number.parseInt(skipRaw)
  const limit = Number.parseInt(limitRaw)

  const aggregateOutput = await event_sponsors_partner_detailsM.aggregate(buildManualCompanySponsorListPipeline({ companyRowId: company_row_id, skip, limit }))
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, counts: count }
}

/** New — Partner counterpart of getManualCompanySponsorList above; same rationale. */
export async function getManualCompanyPartnerList({ actor, companyRowIdRaw, skipRaw, limitRaw }: GetManualCompanySponsorOrPartnerListParams) {
  if (!actor.status) {
    return actor
  }

  const errObj = validateSponsorPartnerListParams({ companyRowIdRaw, skipRaw, limitRaw })
  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  const skip = Number.parseInt(skipRaw)
  const limit = Number.parseInt(limitRaw)

  const aggregateOutput = await event_sponsors_partner_detailsM.aggregate(buildManualCompanyPartnerListPipeline({ companyRowId: company_row_id, skip, limit }))
  const { data, count } = extractPaginatedResult(aggregateOutput)

  return { status: true, message: data, counts: count }
}

export interface DeleteManualCompanyParams {
  actor: AdminActor
  companyRowIdRaw: string
}

/** Ports manual_retrievals.js's GET /delete_manual_company/:company_row_id (lines 1195-1260) verbatim, including its cross-collection cleanup of funding/sponsors/work-experience records referencing this manual company. */
export async function deleteManualCompany({ actor, companyRowIdRaw }: DeleteManualCompanyParams) {
  if (!actor.status) {
    return actor
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Invalid Manual Company Row ID' } }
  }

  if (Number.parseInt(actor.message.sub_admin_type) == 2) {
    return { status: false, message: { alert_message: 'You do not have permission to perform this action' } }
  }

  const check_query = await company_manual_retrievalsM.findOne({ _id: company_row_id, approval_status: { $in: [0, 2] } })
  if (!check_query) {
    return { status: false, message: { alert_message: 'Invalid Manual Company Row ID' } }
  }

  const funds_invested_query = await fundingInvestmentM.findOne({ investor_type: 2, investor_registered_type: 2, investor_row_id: company_row_id })
  if (funds_invested_query) {
    await deleteUserFunding({ type: 2, investor_type: 2, registered_type: 2, funding_row_id: company_row_id, investment_type: 1 })
  }

  const funds_raised_query = await fundingInvestmentM.findOne({ investor_type: 2, funds_raised_registered_type: 2, funds_raised_company_row_id: company_row_id })
  if (funds_raised_query) {
    await deleteUserFunding({ type: 2, investor_type: 2, registered_type: 2, funding_row_id: company_row_id, investment_type: 2 })
  }

  const user_funds_raised_query = await fundingInvestmentM.findOne({ investor_type: 1, funds_raised_registered_type: 2, funds_raised_company_row_id: company_row_id })
  if (user_funds_raised_query) {
    await deleteUserFunding({ type: 2, investor_type: 1, registered_type: 2, funding_row_id: company_row_id, investment_type: 2 })
  }

  const sp_query = await event_sponsors_partner_detailsM.findOne({ account_type: 2, registered_type: 2, user_company_row_id: company_row_id })
  if (sp_query) {
    await deleteSponsorsPartners({ type: 2, account_type: 2, registered_type: 2, user_company_row_id: company_row_id })
  }

  const work_experience_query = await professionals_work_experienceM.findOne({ company_type: 2, company_row_id: company_row_id })
  if (work_experience_query) {
    await deleteProfessionalDetails({ type: 2, user_company_row_id: company_row_id, user_type: 2, reqistered_type: 2 })
  }

  await company_manual_retrievalsM.deleteOne({ _id: company_row_id })
  await invalidateManualCompanyListCache()

  return { status: true, message: { alert_message: 'This company details has been deleted completely.' } }
}
