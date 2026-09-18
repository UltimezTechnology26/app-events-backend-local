// modules/company_admin/company_admin.queries.ts
const professionalsM = require('../../../models/app/professionalsM')
const companyM = require('../../../models/app/company/companyM')
const sub_adminM = require('../../../models/admin_panel/app/sub_adminM')
const companyPodcastsM = require('../../../models/app/podcast/companyPodcastsM')
const eventM = require('../../../models/app/events/eventM')
const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')
const countryM = require('../../../models/app/static/countryM')
const company_seo_detailsM = require('../../../models/app/company/company_seo_detailsM')
const company_social_linksM = require('../../../models/app/company/company_social_linksM')
const sanitize = require('mongo-sanitize')

/** Ports company.js's company_events_list's "created by this company" branch (lines 55-84). */
export function buildCompanyEventsCreatedPipeline({ companyRowId }: { companyRowId: number }) {
  return [
    { $match: { company_row_id: companyRowId, list_event_type: { $in: [2, 3] } } },
    { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
    { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        event_title: 1,
        event_type: 1,
        event_image: 1,
        event_url: 1,
        event_image_type: 1,
        start_date: 1,
        end_date: 1,
        active_status: 1,
        approval_status: 1,
        list_event_type: 1,
        utc_time: '$utc_dates.utc_time',
      },
    },
  ]
}

/** Ports company.js's company_events_list's "sponsored by this company" branch (lines 86-150). */
export function buildCompanyEventsSponsoredPipeline({ companyRowId }: { companyRowId: number }) {
  return [
    { $match: { account_type: 2, registered_type: 1, user_company_row_id: companyRowId } },
    {
      $lookup: {
        from: 'cln_events',
        localField: 'event_row_id',
        foreignField: '_id',
        as: 'event_info',
        pipeline: [
          { $match: { _id: { $exists: true } } },
          { $lookup: { from: 'cln_events_utc_dates', localField: 'utc_row_id', foreignField: '_id', as: 'utc_dates' } },
          { $unwind: { path: '$utc_dates', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              event_title: 1,
              event_type: 1,
              event_image: 1,
              event_url: 1,
              event_image_type: 1,
              start_date: 1,
              end_date: 1,
              active_status: 1,
              approval_status: 1,
              list_event_type: 1,
              utc_time: '$utc_dates.utc_time',
            },
          },
        ],
      },
    },
    { $unwind: { path: '$event_info', preserveNullAndEmptyArrays: true } },
    { $match: { 'event_info._id': { $exists: true } } },
    {
      $project: {
        sponsor_partner_type: 1,
        sponsorship_type_title: 1,
        event_title: '$event_info.event_title',
        event_type: '$event_info.event_type',
        event_image: '$event_info.event_image',
        event_url: '$event_info.event_url',
        event_image_type: '$event_info.event_image_type',
        start_date: '$event_info.start_date',
        end_date: '$event_info.end_date',
        active_status: '$event_info.active_status',
        approval_status: '$event_info.approval_status',
        list_event_type: '$event_info.list_event_type',
        utc_time: '$event_info.utc_time',
      },
    },
  ]
}

/**
 * Ports company.js's subadmin_overview (lines 2218-2269).
 *
 * CONFIRMED BUG FIX: the real source's $lookup used `foreignField: "created_admin_row_id"` —
 * a field that does not exist anywhere on companyM's schema (confirmed via the model file; only
 * `sub_admin_row_id`/`approval_sub_admin_row_id` exist). This meant the lookup never matched
 * anything, so `total_company` was silently an empty array for every sub-admin, always. Fixed to
 * the real field name, `sub_admin_row_id` (the field every admin-created-company write path,
 * e.g. create_company_details/update_basic_company_details, actually sets).
 */
export function buildSubadminOverviewPipeline() {
  return [
    { $match: { login_status: 1, create_type_row_id: 7 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: '_id',
        foreignField: 'sub_admin_row_id',
        pipeline: [{ $project: { _id: 1, approval_status: 1 } }],
        as: 'info_company',
      },
    },
    { $project: { _id: 1, full_name: 1, email_id: 1, total_company: '$info_company', date_n_time: 1 } },
  ]
}

// --- Data access for company_admin.service.ts. Grouped by the function each one is used from.

/** checkUserOrCompanyIdAvailability's investor_type === 1 branch. */
export async function findProfessionalByUserName(userName: string) {
  return professionalsM.findOne({ user_name: userName })
}

/** checkUserOrCompanyIdAvailability's investor_type === 2 branch (confirmed `company_id` field-name fix). */
export async function findCompanyByCompanyId(companyId: string) {
  return companyM.findOne({ company_id: companyId })
}

/** getSubadminList. */
export async function findActiveSubAdminsBrief() {
  return sub_adminM.find({ login_status: 1 }, { _id: 1, full_name: 1 }).sort({ full_name: 1 })
}

/**
 * computeYearsOverview's 8 countDocuments() calls — one date-range filter, optionally narrowed
 * to sub-admin-created companies (the `admin_*` counters).
 */
export function buildYearsOverviewCountFilter({ gte, lte, subAdminOnly }: { gte: Date; lte?: Date; subAdminOnly?: boolean }) {
  const filter: Record<string, unknown> = {
    active_status: 1,
    created_date_n_time: lte ? { $gte: gte, $lte: lte } : { $gte: gte },
  }
  if (subAdminOnly) {
    filter.sub_admin_row_id = { $gte: 1 }
  }
  return filter
}

/** enableCompany/disableCompany's initial "does this company exist" check. */
export async function findCompanyById(companyRowId: number) {
  return companyM.findOne({ _id: companyRowId })
}

/** enableCompany/disableCompany's "is it actually in the state we expect" check. */
export async function findCompanyByIdWithActiveStatus(companyRowId: number, activeStatus: number) {
  return companyM.findOne({ _id: companyRowId, active_status: activeStatus })
}

/** enableCompany's owning-user login-status check. */
export async function findActiveProfessionalById(userRowId: number) {
  return professionalsM.findOne({ _id: userRowId, login_status: 1 })
}

/** enableCompany/disableCompany's status-flip write. */
export async function updateCompanyFields(companyRowId: number, updateFields: Record<string, unknown>) {
  return companyM.updateOne({ _id: companyRowId }, { $set: updateFields })
}

/** enableCompany's stale-podcast cleanup. */
export async function findCompanyPodcastByCompanyRowId(companyRowId: number) {
  return companyPodcastsM.findOne({ company_row_id: companyRowId })
}

export async function deleteCompanyPodcastByCompanyRowId(companyRowId: number) {
  return companyPodcastsM.deleteOne({ company_row_id: companyRowId })
}

/** disableCompany's "does this company have events to also deactivate" check. */
export async function findEventByCompanyRowId(companyRowId: number) {
  return eventM.findOne({ company_row_id: companyRowId })
}

export async function updateEventsActiveStatusByCompanyRowId(companyRowId: number, activeStatus: number) {
  return eventM.updateMany({ company_row_id: companyRowId }, { $set: { active_status: activeStatus } })
}

/** bulkImportCompanies's per-row uniqueness checks. */
export async function findCompanyByNameCI(companyName: string) {
  return companyM.findOne({ company_name: sanitize(companyName) }).collation({ locale: 'en', strength: 2 })
}

export async function findCompanyByEmailCI(companyEmailId: string) {
  return companyM.findOne({ company_email_id: sanitize(companyEmailId) }).collation({ locale: 'en', strength: 2 })
}

export async function findCompanyByContactNumber(contactNumber: string) {
  return companyM.findOne({ contact_number: sanitize(contactNumber) })
}

export async function findBusinessModelByNameCI(businessName: string) {
  return company_business_modelsM.findOne({ business_name: sanitize(businessName) }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
}

export async function findCountryByNameCI(countryName: string) {
  return countryM.findOne({ country_name: sanitize(countryName) }, { _id: 1 }).collation({ locale: 'en', strength: 2 })
}

export async function insertCompany(insertFields: Record<string, unknown>) {
  return companyM(insertFields).save()
}

export async function insertCompanySeoDetails(seoFields: Record<string, unknown>) {
  return company_seo_detailsM(seoFields).save()
}

export async function insertCompanySocialLinks(socialFields: Record<string, unknown>) {
  return company_social_linksM(socialFields).save()
}

/** updateCompanyPageDetails's company_logo replace-then-delete-old-logo step. */
export async function findCompanyLogoById(companyRowId: number) {
  return companyM.findOne({ _id: companyRowId }, { _id: 1, company_logo: 1 })
}

export async function updateCompanyLogo(companyRowId: number, companyLogo: string) {
  return companyM.updateOne({ _id: companyRowId }, { $set: { company_logo: companyLogo } })
}
