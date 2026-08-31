// modules/partners/partners.service.ts
const sanitize = require('mongo-sanitize')
const { getPresentDateTime, getMinusDates, checkCompanySubadminAccess } = require('../../../utils/helpers/helper')
import { getIntValues, escapeRegex } from '@ultimez-interview/coinpedia-backend-library/validation'
const { sendEmail } = require('../../../config/email')
const { updateNotification } = require('../../../utils/helpers/notification_helper')
import logger from '../../../config/logger'
const companyM = require('../../../models/app/company/companyM')
const added_to_partnersM = require('../../../models/app/company/added_to_partnersM')
const company_requests_to_partnersM = require('../../../models/app/company/company_requests_to_partnersM')
const companyBusinessModelsM = require('../../../models/app/static/company_business_modelsM')
const countryM = require('../../../models/app/static/countryM')
const eventM = require('../../../models/app/events/eventM')
const jobsM = require('../../../models/app/jobs/jobsM')
const event_sponsors_partner_detailsM = require('../../../models/app/events/event_sponsors_partner_detailsM')
const { getTokenList, filterTokens, getCompanyProducts, getMatchedProducts } = require('../../../utils/helpers/app_helper')
const { getPartnersListFundsRaisedResult, getPartnersListFundsInvestedResult } = require('../funding/funding.service')
const { getPartnerRevenueReportList } = require('../company_revenue/company_revenue.queries')
const { getPartnerProductsReportList } = require('../company_products/company_products.queries')
const { getPartnerHoldingsReportList } = require('../company_holdings/company_holdings.queries')
import {
  buildPartnersSearchArray,
  buildTopPartnerCountriesPipeline,
  buildPartnersCompaniesPipeline,
  buildPartnersEventsPipeline,
  buildPartnersJobsPipeline,
  extractPartnersPaginatedResult,
  buildPartnerRequestsListPipeline,
  buildAdminPartnersListPipeline,
  buildLiveCompanyPartnersCountPipeline,
  buildEventPartnersSponsorTotalPipeline,
} from './partners.queries'
import { buildPartnersListKey, getPartnersListCache, setPartnersListCache, invalidatePartnersListCache, invalidatePartnerIndividualOtherDetailsCache } from './partners.cache'

interface Actor {
  status: boolean
  message: any
}

// ─── App-side ───────────────────────────────────────────────────────────────

export interface SubmitRequestToBecomePartnerParams {
  actor: Actor
}

/**
 * Ports front_page.js's GET /submit_request_to_become_partner (lines 834-911).
 *
 * FLAGGED, NOT RESOLVED (per requirements.md, a product/business-logic judgment call): the
 * duplicate-check below is scoped per-company_row_id only, not per-status — once a company has
 * ever had a request rejected, this route has no path for a resubmission by anyone. Ported
 * faithfully, not silently loosened.
 */
export async function submitRequestToBecomePartner({ actor }: SubmitRequestToBecomePartnerParams) {
  if (!actor.status) {
    return actor
  }

  const user_row_id = actor.message
  const user_company = await companyM.findOne({ user_row_id }).select('_id approval_status active_status')

  if (!user_company) {
    return { status: false, message: { alert_message: 'You do not have a registered company.' } }
  }

  if (user_company.active_status !== 1 || user_company.approval_status !== 1) {
    return { status: false, message: { alert_message: 'Your company is not active or approved yet.' } }
  }

  const company_row_id = user_company._id

  const is_already_partner = await added_to_partnersM.findOne({ company_row_id })
  if (is_already_partner) {
    return { status: false, message: { alert_message: 'Your company is already a partner.' } }
  }

  const existing_request = await company_requests_to_partnersM.findOne({ company_row_id })
  if (existing_request) {
    return { status: false, message: { alert_message: 'Your partnership request has already been submitted.' } }
  }

  await new company_requests_to_partnersM({
    user_row_id,
    company_row_id,
    approval_status: 0,
    date_n_time: getPresentDateTime(),
  }).save()
  await invalidatePartnersListCache()

  return { status: true, message: { alert_message: 'Your request to become a partner has been submitted successfully.' } }
}

export interface GetPartnersUniqueBusinessesResult {
  status: boolean
  message?: any[]
  other_array?: any[]
}

/**
 * Ports front_page.js's GET /partners_unique_businesses (lines 1252-1283).
 *
 * CONFIRMED BUG FIX: the real source correctly scoped the business-model *list* to partner
 * companies (via `idList`/`unique`, both derived from added_to_partnersM), but then computed each
 * business model's `count` via `companyM.countDocuments({main_business_model_id: i})` — with NO
 * partner-company filter at all, silently counting every company on the platform instead of just
 * partners. Fixed to scope the count to the same partner-company id list the rest of the function
 * already uses.
 */
export async function getPartnersUniqueBusinesses(): Promise<GetPartnersUniqueBusinessesResult> {
  const listPartners = await added_to_partnersM.find({}, { company_row_id: 1 })
  const idList = listPartners.map((p: any) => p.company_row_id)

  const unique: number[] = await companyM.find({ _id: { $in: idList } }, { main_business_model_id: 1 }).distinct('main_business_model_id')

  const results: { main_business_id: number; main_business_name: string; count: number }[] = []
  for (const businessModelId of unique) {
    const checkActive = await companyBusinessModelsM.findOne({ _id: businessModelId, active_status: true }, { business_name: 1, _id: 0 })
    if (checkActive) {
      results.push({
        main_business_id: businessModelId,
        main_business_name: checkActive.business_name,
        count: await companyM.countDocuments({ main_business_model_id: businessModelId, _id: { $in: idList } }),
      })
    }
  }

  results.sort((a, b) => b.count - a.count)

  return { status: true, message: results.slice(0, 4), other_array: results.slice(4, unique.length) }
}

export interface GetPartnerListDetailsParams {
  reqQuery: Record<string, any>
  skip: number
  limit: number
  userRowId: number
}

/**
 * Ports services/company/front_page.ts's getPartnerListDetails()+runPartnersListBranch()+
 * partnersList() (lines 2991-5892). Dispatch structure preserved exactly: report_list_types 3/4
 * delegate to modules/funding (already migrated), 5/6/7 delegate to
 * company_revenue/company_products/company_holdings (already migrated) — those branches'
 * ORIGINAL inline bodies still sitting inside partnersList() (types 3/4 specifically) are
 * confirmed dead code, since runPartnersListBranch() never lets those values reach partnersList();
 * not ported here, matching this project's dead-code-deletion precedent. Types 1/2/8 are real,
 * reachable branches, $facet-converted per the standing list+count fix (see partners.queries.ts).
 */
export async function getPartnerListDetails({ reqQuery, skip, limit, userRowId }: GetPartnerListDetailsParams) {
  try {
    const reportListType = reqQuery.report_list_type ? Number.parseInt(reqQuery.report_list_type) : 1

    const businessModelIds = reqQuery.business_model_id ? await getIntValues(reqQuery.business_model_id) : undefined
    const searchArray = buildPartnersSearchArray({
      search: reqQuery.search?.trim() ? sanitize(reqQuery.search.trim()) : undefined,
      businessModelIds,
      location: reqQuery.location ? sanitize(reqQuery.location) : undefined,
      reportListType,
      categoryRowId: reqQuery.category_row_id !== undefined ? Number.parseInt(reqQuery.category_row_id) : undefined,
      revenueGrowthId: reqQuery.revenue_growth_id !== undefined ? Number.parseInt(reqQuery.revenue_growth_id) : undefined,
    })

    let matchQuery: Record<string, any> = {}
    let sortFilter: Record<string, any> = { $sort: { _id: 1 } }
    if (reportListType === 2) {
      const eventTypeId = Number.parseInt(reqQuery.event_type_id)
      if (eventTypeId === 1) {
        const start = getMinusDates(7)
        if (start) matchQuery = { start_date: { $gte: new Date(start) } }
      } else if (eventTypeId === 2) {
        sortFilter = { $sort: { total_events: -1 } }
      } else if (eventTypeId === 3) {
        sortFilter = { $sort: { total_events: 1 } }
      }
    }

    const countryDetailsCache = await countryM.find({}, { _id: 1, country_name: 1, country_flag: 1, sortname: 1, country_code: 1 }).lean()
    const countryMap = new Map<string, any>()
    const countryRegexList = countryDetailsCache.map((c: any) => {
      const escapedName = escapeRegex(c.country_name)
      countryMap.set(c.country_name.toLowerCase(), c)
      return { name: c.country_name, regex: new RegExp(`\\b${escapedName}\\b`, 'i') }
    })

    const topPartnersAgg = await added_to_partnersM.aggregate(buildTopPartnerCountriesPipeline(countryRegexList))
    const topCountries = topPartnersAgg.map((c: any) => {
      const match = countryMap.get(c._id.toLowerCase())
      return {
        country_id: match?._id || 0,
        country_name: match?.country_name || c._id,
        country_flag: match?.country_flag || '',
        sortname: match?.sortname || '',
        country_code: match?.country_code || '',
        partner_count: c.partner_count,
      }
    })

    const hasFilters = searchArray.length > 1
    const key = buildPartnersListKey({ skip, limit, reportListType, reqQuery, userRowId })

    if (!hasFilters) {
      const cache_response = await getPartnersListCache(key)
      if (cache_response.status) {
        return { status: true, list: cache_response.message.list, count: cache_response.message.count, topCountries: cache_response.message.topCountries, cache_reponse_status: true }
      }
    }

    const { list, count } = await runPartnersListBranch({ reportListType, searchArray, skip, limit, userRowId, matchQuery, sortFilter })

    if (!hasFilters) {
      await setPartnersListCache(key, { list, count, topCountries })
    }

    return { status: true, list, count, topCountries, cache_reponse_status: false }
  } catch (error: any) {
    logger.error('Error in partnerList:', error)
    return { status: false, message: 'An error occurred while fetching partner list', count: 0, topCountries: [], cache_reponse_status: false }
  }
}

async function runPartnersListBranch({
  reportListType,
  searchArray,
  skip,
  limit,
  userRowId,
  matchQuery,
  sortFilter,
}: {
  reportListType: number
  searchArray: Record<string, any>[]
  skip: number
  limit: number
  userRowId: number
  matchQuery: Record<string, any>
  sortFilter: Record<string, any>
}): Promise<{ list: any[]; count: number }> {
  if (reportListType === 3) {
    return getPartnersListFundsRaisedResult({ searchArray, skip, limit, user_row_id: userRowId })
  }
  if (reportListType === 4) {
    return getPartnersListFundsInvestedResult({ searchArray, skip, limit, user_row_id: userRowId })
  }
  if (reportListType === 5) {
    return getPartnerRevenueReportList({ searchArray, skip, limit, user_row_id: userRowId })
  }
  if (reportListType === 6) {
    return getPartnerProductsReportList({ searchArray, skip, limit, user_row_id: userRowId })
  }
  if (reportListType === 7) {
    return getPartnerHoldingsReportList({ searchArray, skip, limit, user_row_id: userRowId })
  }
  if (reportListType === 2) {
    const aggregateOutput = await eventM.aggregate(buildPartnersEventsPipeline({ matchQuery, sortFilter, searchArray, userRowId, skip, limit }))
    const { data, count } = extractPartnersPaginatedResult(aggregateOutput)
    return { list: data, count }
  }
  if (reportListType === 8) {
    const aggregateOutput = await jobsM.aggregate(buildPartnersJobsPipeline({ matchQuery, searchArray, userRowId, skip, limit }))
    const { data, count } = extractPartnersPaginatedResult(aggregateOutput)
    return { list: data, count }
  }
  // report_list_type === 1 (default)
  const aggregateOutput = await added_to_partnersM.aggregate(buildPartnersCompaniesPipeline({ searchArray, userRowId, skip, limit }))
  const { data, count } = extractPartnersPaginatedResult(aggregateOutput)

  // CONFIRMED BUG FIX (found via live testing): the real source resolves each row's raw
  // `token_row_ids`/`product_ids` into fully-enriched `tokens_list`/`products` objects
  // (services/company/front_page.ts:5677-5687, partnersList()'s tail) before returning —
  // the initial port of this branch dropped that resolution step entirely, so the Companies
  // report's Assets/Owned-Products columns received raw id arrays the frontend never reads.
  const tokenRowIds = data.flatMap((row: any) => row.token_row_ids || [])
  const tokenList = await getTokenList({ token_ids: tokenRowIds })
  const productsList = await getCompanyProducts(data)

  const enrichedData = await Promise.all(
    data.map(async (row: any) => {
      const enriched = { ...row }
      if (Array.isArray(row.token_row_ids) && row.token_row_ids.length > 0) {
        enriched.tokens_list = await filterTokens({ token_ids: row.token_row_ids, token_list: tokenList })
      }
      if (Array.isArray(row.product_ids) && row.product_ids.length > 0) {
        enriched.products = await getMatchedProducts(row.product_ids, productsList)
      }
      return enriched
    }),
  )

  return { list: enrichedData, count }
}

// ─── Admin-side ─────────────────────────────────────────────────────────────

export interface GetPartnerRequestsListParams {
  actor: Actor
  approvalStatusRaw: string
  skipRaw: string
  limitRaw: string
  search?: string
  profileScore?: string
}

/** Ports requests_to_partners.js's GET /list/:approval_status/:skip/:limit (lines 16-267), $facet-converted. */
export async function getPartnerRequestsList({ actor, approvalStatusRaw, skipRaw, limitRaw, search, profileScore }: GetPartnerRequestsListParams) {
  if (!actor.status) {
    return actor
  }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50
  const approvalStatus = !Number.isNaN(Number.parseInt(approvalStatusRaw)) ? Number.parseInt(approvalStatusRaw) : 0

  const scoreQuery: Record<string, any> = {}
  if (search) {
    scoreQuery.$and = [
      {
        $or: [
          { company_name: { $regex: search, $options: 'i' } },
          { company_id: { $regex: search, $options: 'i' } },
          { company_email_id: { $regex: search, $options: 'i' } },
          { user_name: { $regex: search, $options: 'i' } },
          { full_name: { $regex: search, $options: 'i' } },
          { email_id: { $regex: search, $options: 'i' } },
        ],
      },
    ]
  }
  if (profileScore === '0-24') scoreQuery.profile_score = { $gte: 0, $lte: 24 }
  else if (profileScore === '25-49') scoreQuery.profile_score = { $gte: 25, $lte: 49 }
  else if (profileScore === '50-74') scoreQuery.profile_score = { $gte: 50, $lte: 74 }
  else if (profileScore === '75-100') scoreQuery.profile_score = { $gte: 75, $lte: 100 }

  const aggregateOutput = await company_requests_to_partnersM.aggregate(buildPartnerRequestsListPipeline({ approvalStatus, scoreQuery, skip, limit }))
  const { data, count } = extractPartnersPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

export interface ApprovePartnerRequestParams {
  actor: Actor
  requestRowIdRaw: string
}

/** Ports requests_to_partners.js's GET /approve_request/:request_row_id (lines 269-404). */
export async function approvePartnerRequest({ actor, requestRowIdRaw }: ApprovePartnerRequestParams) {
  if (!actor.status) {
    return actor
  }

  const request_row_id = Number.parseInt(requestRowIdRaw)
  if (Number.isNaN(request_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } }
  }

  const queryRun = await company_requests_to_partnersM.aggregate([
    { $match: { _id: request_row_id, approval_status: 0 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        claim_type: 1,
        user_row_id: 1,
        company_row_id: 1,
        date_n_time: 1,
        approval_date_n_time: 1,
        rejected_reason: 1,
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_email_id: '$company_info.company_email_id',
        website_link: '$company_info.website_link',
        contact_number: '$company_info.contact_number',
        company_logo: '$company_info.company_logo',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        approval_status: '$company_info.approval_status',
        active_status: '$company_info.active_status',
      },
    },
  ])

  if (!queryRun[0]) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } }
  }

  const company_row_id = queryRun[0].company_row_id
  const user_row_id = queryRun[0].user_row_id ? queryRun[0].user_row_id : 0
  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(actor.message.admin_row_id),
    admin_manager_type: actor.message.admin_manager_type,
    sub_admin_type: Number.parseInt(actor.message.sub_admin_type),
    company_row_id,
  })

  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const date_n_time = getPresentDateTime()

  const check_added_to_partner_query = await added_to_partnersM.findOne({ company_row_id })
  if (!check_added_to_partner_query) {
    await new added_to_partnersM({ company_row_id, date_n_time }).save()
  }

  await company_requests_to_partnersM.updateOne({ _id: request_row_id }, { $set: { approval_status: 1, approval_date_n_time: date_n_time } })
  await invalidatePartnersListCache()

  await updateNotification({
    user_row_id,
    notify_type: 2,
    notify_type_row_id: company_row_id,
    message_row_id: 23,
    action_row_id: request_row_id,
    notify_image: queryRun[0].company_logo,
    notify_name: queryRun[0].company_name,
    notify_id: queryRun[0].approval_status == 1 && queryRun[0].active_status == 1 ? queryRun[0].company_id : '',
  })

  const pass_subject = `Welcome ${queryRun[0].company_name} – Your Partnership is Confirmed !`
  const pass_message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Hello ${queryRun[0].full_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We are delighted to inform you that your company has been successfully accepted as a valued partner of <b style="text-transform: capitalize;">Coinpedia</b>. Congratulations!</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">As our partner, you will have access to exclusive benefits, resources, and opportunities to grow together with us. We are excited to collaborate and achieve great success.</p>
    `
  await sendEmail(queryRun[0].email_id, pass_subject, pass_message)

  return { status: true, message: { alert_message: 'Congratulations! This company is now approved and has been added to the partner list.' } }
}

export interface RejectPartnerRequestParams {
  actor: Actor
  requestRowIdRaw: string
  body: Record<string, any>
  preValidationErrors: Record<string, string>
}

/** Ports requests_to_partners.js's POST /reject_request/:request_row_id (lines 406-545). */
export async function rejectPartnerRequest({ actor, requestRowIdRaw, body, preValidationErrors }: RejectPartnerRequestParams) {
  const errObj: Record<string, any> = { ...preValidationErrors }

  if (!actor.status) {
    errObj['alert_message'] = actor.message
  }

  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const request_row_id = Number.parseInt(requestRowIdRaw)

  const get_query = await company_requests_to_partnersM.aggregate([
    { $match: { _id: request_row_id, approval_status: 0 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_lists', localField: 'company_row_id', foreignField: '_id', as: 'company_info' } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        claim_type: 1,
        user_row_id: 1,
        company_row_id: 1,
        date_n_time: 1,
        approval_date_n_time: 1,
        rejected_reason: 1,
        company_name: '$company_info.company_name',
        company_id: '$company_info.company_id',
        company_email_id: '$company_info.company_email_id',
        website_link: '$company_info.website_link',
        contact_number: '$company_info.contact_number',
        company_logo: '$company_info.company_logo',
        user_name: '$user_info.user_name',
        full_name: '$user_info.full_name',
        email_id: '$user_info.email_id',
        approval_status: '$company_info.approval_status',
        active_status: '$company_info.active_status',
      },
    },
  ])

  if (!get_query[0]) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Request Row Id' } }
  }

  const company_row_id = get_query[0].company_row_id
  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(actor.message.admin_row_id),
    admin_manager_type: actor.message.admin_manager_type,
    sub_admin_type: Number.parseInt(actor.message.sub_admin_type),
    company_row_id,
  })

  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const date_n_time = getPresentDateTime()
  const user_row_id = get_query[0].user_row_id ? get_query[0].user_row_id : 0

  await company_requests_to_partnersM.updateOne({ _id: request_row_id }, { $set: { approval_status: 2, rejected_reason: body.rejected_reason, approval_date_n_time: date_n_time } })
  await invalidatePartnersListCache()

  await updateNotification({
    user_row_id,
    notify_type: 2,
    notify_type_row_id: company_row_id,
    message_row_id: 28,
    action_row_id: request_row_id,
    notify_image: get_query[0].company_logo,
    notify_name: get_query[0].company_name,
    notify_id: get_query[0].approval_status == 1 && get_query[0].active_status == 1 ? get_query[0].company_id : '',
  })

  const pass_subject = `${get_query[0].company_name} – Partnership Request Update`
  const pass_message = `
    <p style="margin: 24px 0;font-weight: 500;font-size:22px;text-transform: capitalize;color:#000;">Dear ${get_query[0].full_name},</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">Thank you for reaching out and expressing interest in partnering with Coinpedia. We truly appreciate your proposal and the opportunity to explore potential collaboration.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">After careful consideration, we regret to inform you that we are unable to proceed with a partnership at this time. This decision is based on our current strategic priorities and commitments.</p>
    <p style="color:#000;font-weight: 400;font-size:17px;">We appreciate your understanding and wish you success in your endeavors. Please feel free to stay in touch for any future opportunities.</p>
    `
  await sendEmail(get_query[0].email_id, pass_subject, pass_message)

  return { status: true, message: { alert_message: 'The partnership request from this company has been rejected.' } }
}

export interface RemoveFromPartnerParams {
  actor: Actor
  companyRowIdRaw: string
}

/** Ports company.js's GET /remove_from_partner/:company_row_id (lines 4669-4730). */
export async function removeFromPartner({ actor, companyRowIdRaw }: RemoveFromPartnerParams) {
  if (!actor.status) {
    return actor
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Partner row id' } }
  }

  const queryRunCheck = await added_to_partnersM.findOne({ company_row_id })
  if (!queryRunCheck) {
    return { status: false, message: { alert_message: 'Oops! Invalid Partner Row ID.' } }
  }

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(actor.message.admin_row_id),
    admin_manager_type: actor.message.admin_manager_type,
    sub_admin_type: Number.parseInt(actor.message.sub_admin_type),
    company_row_id,
  })

  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  await added_to_partnersM.deleteOne({ company_row_id })

  const checkCompany = await companyM.findOne({ _id: company_row_id })
  if (checkCompany.user_row_id) {
    await updateNotification({
      user_row_id: checkCompany.user_row_id,
      notify_type: 2,
      notify_type_row_id: company_row_id,
      message_row_id: 24,
      action_row_id: company_row_id,
      notify_image: checkCompany.company_logo,
      notify_name: checkCompany.company_name,
      notify_id: checkCompany.approval_status == 1 && checkCompany.active_status == 1 ? checkCompany.company_id : '',
    })
  }

  await invalidatePartnersListCache()
  await invalidatePartnerIndividualOtherDetailsCache()

  return { status: true, message: { alert_message: 'This company is removed from your partners list successfully.' } }
}

export interface AddToPartnersParams {
  actor: Actor
  companyRowIdRaw: string
}

/**
 * Ports company.js's GET /add_to_partners/:company_row_id (lines 4732-4797).
 *
 * CONFIRMED BUG FIX: after force-adding a company as a partner, the real source looked up any
 * matching PENDING partner request (`approval_status: 0`) and then set `approval_status: 0` on
 * it again — a literal no-op, leaving the request record permanently out of sync with the actual
 * (now-approved) partner status. Fixed to set `approval_status: 1`, reconciling the request record
 * with what actually just happened.
 */
export async function addToPartners({ actor, companyRowIdRaw }: AddToPartnersParams) {
  if (!actor.status) {
    return actor
  }

  const company_row_id = Number.parseInt(companyRowIdRaw)
  if (Number.isNaN(company_row_id)) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Company row id' } }
  }

  const checkCompany = await companyM.findOne({ _id: company_row_id })
  if (!checkCompany) {
    return { status: false, message: { alert_message: 'Inavlid Company Row Id' } }
  }

  const check_access = await checkCompanySubadminAccess({
    admin_row_id: Number.parseInt(actor.message.admin_row_id),
    admin_manager_type: actor.message.admin_manager_type,
    sub_admin_type: Number.parseInt(actor.message.sub_admin_type),
    company_row_id,
  })

  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const queryRunCheck = await added_to_partnersM.findOne({ company_row_id })
  if (queryRunCheck) {
    return { status: false, message: { alert_message: 'Company already added partner.' } }
  }

  const insert_query = await new added_to_partnersM({ company_row_id, date_n_time: getPresentDateTime() }).save()
  await invalidatePartnersListCache()
  await invalidatePartnerIndividualOtherDetailsCache()

  if (checkCompany.user_row_id) {
    await updateNotification({
      user_row_id: checkCompany.user_row_id,
      notify_type: 2,
      notify_type_row_id: company_row_id,
      message_row_id: 23,
      action_row_id: insert_query._id,
      notify_image: checkCompany.company_logo,
      notify_name: checkCompany.company_name,
      notify_id: checkCompany.approval_status == 1 && checkCompany.active_status == 1 ? checkCompany.company_id : '',
    })

    const get_query = await company_requests_to_partnersM.findOne({ company_row_id, user_row_id: checkCompany.user_row_id, approval_status: 0 })
    if (get_query) {
      await company_requests_to_partnersM.updateOne({ _id: get_query._id }, { $set: { approval_status: 1 } })
    }
  }

  return { status: true, message: { alert_message: 'This company added to partners list successfully.' } }
}

export interface GetAdminPartnersListParams {
  actor: Actor
  skipRaw: string
  limitRaw: string
  search?: string
  profileScore?: string
}

/** Ports company.js's GET /partners_list/:skip/:limit (admin-side directory, lines 3782-4022), $facet-converted per the standing list+count fix. */
export async function getAdminPartnersList({ actor, skipRaw, limitRaw, search, profileScore }: GetAdminPartnersListParams) {
  if (!actor.status) {
    return actor
  }

  const skip = !Number.isNaN(Number.parseInt(skipRaw)) ? Number.parseInt(skipRaw) : 0
  const limit = !Number.isNaN(Number.parseInt(limitRaw)) ? Number.parseInt(limitRaw) : 50

  const elemMatchQuery: Record<string, any> = {}
  if (search) {
    elemMatchQuery.$or = [
      { company_name: { $regex: search, $options: 'i' } },
      { company_id: { $regex: search, $options: 'i' } },
      { company_email_id: { $regex: search, $options: 'i' } },
    ]
  }
  if (profileScore === '0-24') elemMatchQuery.profile_score = { $gte: 0, $lte: 24 }
  else if (profileScore === '25-49') elemMatchQuery.profile_score = { $gte: 25, $lte: 49 }
  else if (profileScore === '50-74') elemMatchQuery.profile_score = { $gte: 50, $lte: 74 }
  else if (profileScore === '75-100') elemMatchQuery.profile_score = { $gte: 75, $lte: 100 }

  const aggregateOutput = await added_to_partnersM.aggregate(buildAdminPartnersListPipeline({ elemMatchQuery, skip, limit }))
  const { data, count } = extractPartnersPaginatedResult(aggregateOutput)

  return { status: true, message: data, count }
}

/**
 * Ports the admin dashboard's partner-count block — delegated here from modules/company_admin/
 * (Part 3 §7 Phase H step 3), since these are fundamentally Partners-domain counts, not
 * company-admin's own concern. Includes the confirmed total_event_partners_sponsor fix (see
 * buildEventPartnersSponsorTotalPipeline).
 */
export async function getPartnerDashboardStats() {
  const [become_partners_pending, become_partners_approved, become_partners_rejected, liveCompanyPartnersResult, eventPartnersSponsorResult] = await Promise.all([
    company_requests_to_partnersM.countDocuments({ approval_status: 0 }),
    company_requests_to_partnersM.countDocuments({ approval_status: 1 }),
    company_requests_to_partnersM.countDocuments({ approval_status: 2 }),
    added_to_partnersM.aggregate(buildLiveCompanyPartnersCountPipeline()),
    event_sponsors_partner_detailsM.aggregate(buildEventPartnersSponsorTotalPipeline()),
  ])

  return {
    become_partners_pending,
    become_partners_approved,
    become_partners_rejected,
    live_company_partners: liveCompanyPartnersResult[0]?.count ?? 0,
    total_event_partners_sponsor: eventPartnersSponsorResult[0]?.count ?? 0,
  }
}
