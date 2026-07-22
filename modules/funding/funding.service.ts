/**
 * Actor shape produced directly by checkAllLoginToken's result
 * ({ message: { user_row_id, user_type }, token_message }) — controllers pass this
 * in, service functions never call checkAllLoginToken themselves.
 */
export interface FundingActor {
  user_row_id: number
  user_type: 1 | 2
  token_message: any
}

/**
 * Resolves an app user's own company id from their user_row_id. Companies and
 * professionals are separate collections with independent id sequences — a
 * user_row_id is never itself a valid company_row_id. Ported from the
 * getCompanyByRowId helper duplicated in both original controller files.
 */
export async function resolveOwnCompanyId(userRowId: number): Promise<{ status: boolean; message: number | { alert_message: string } }> {
  const companyM = require('../../models/app/company/companyM')
  const company = await companyM.findOne({ user_row_id: userRowId, approval_status: 1, active_status: 1 }, { _id: 1 })
  if (company) {
    return { status: true, message: Number.parseInt(company._id) }
  }
  return { status: false, message: { alert_message: 'Sorry, Company not listed.' } }
}

const sanitize = require('mongo-sanitize')
const professionalsM = require('../../models/app/professionalsM')
const companyM = require('../../models/app/company/companyM')
const company_manual_retrievalsM = require('../../models/app/company/company_manual_retrievalsM')
const professionals_manual_retrievalsM = require('../../models/app/users/professionals_manual_retrievalsM')
const funding_investor_typesM = require('../../models/app/static/funding_investor_typesM')

export interface ValidatedInvestor {
  investor_type: number
  investor_registered_type: number
  investor_row_id: number
  investor_category_row_id: number
  investor_user_row_id: number
}

/** Validates each investors[] entry against the professional/company tables. All-or-nothing: one invalid entry rejects the whole request. */
export async function validateInvestorsArray(investorsInput: unknown[]): Promise<{ errObj: Record<string, string>; validated: ValidatedInvestor[] }> {
  const errObj: Record<string, string> = {}
  const validated: ValidatedInvestor[] = []

  for (let i = 0; i < investorsInput.length; i++) {
    const raw: any = investorsInput[i]
    const prefix = `investors[${i}]`

    const investor_type = Number.parseInt(raw.investor_type)
    const investor_registered_type = Number.parseInt(raw.investor_registered_type)
    const investor_row_id = Number.parseInt(raw.investor_row_id)

    if (!investor_type || ![1, 2].includes(investor_type)) {
      errObj[`${prefix}.investor_type`] = 'The Investor Type field is required and must be 1 or 2.'
      continue
    }
    if (!investor_registered_type || ![1, 2].includes(investor_registered_type)) {
      errObj[`${prefix}.investor_registered_type`] = 'The Investor Registered Type field is required and must be 1 or 2.'
      continue
    }
    if (!raw.investor_row_id || Number.isNaN(investor_row_id)) {
      errObj[`${prefix}.investor_row_id`] = 'The Investor Row ID field is required.'
      continue
    }

    let investor_user_row_id = 0
    if (investor_type === 1) {
      if (investor_registered_type === 1) {
        const found = await professionalsM.findOne({ _id: investor_row_id, login_status: 1 })
        if (!found) { errObj[`${prefix}.investor_row_id`] = 'Sorry, Invalid registered user row id'; continue }
        investor_user_row_id = investor_row_id
      } else {
        const found = await professionals_manual_retrievalsM.findOne({ _id: investor_row_id }, { _id: 1 })
        if (!found) { errObj[`${prefix}.investor_row_id`] = 'Sorry, Invalid manual user row id'; continue }
      }
    } else {
      if (investor_registered_type === 1) {
        const found = await companyM.findOne({ _id: investor_row_id, active_status: 1 }, { _id: 1, user_row_id: 1 })
        if (!found) { errObj[`${prefix}.investor_row_id`] = 'Sorry, Invalid registered company row id'; continue }
        if (found.user_row_id) investor_user_row_id = found.user_row_id
      } else {
        const found = await company_manual_retrievalsM.findOne({ _id: investor_row_id }, { _id: 1 })
        if (!found) { errObj[`${prefix}.investor_row_id`] = 'Sorry, Invalid manual company row id'; continue }
      }
    }

    let investor_category_row_id = 0
    if (raw.investor_category_row_id) {
      investor_category_row_id = Number.parseInt(sanitize(String(raw.investor_category_row_id)))
      const found = await funding_investor_typesM.findOne({ _id: investor_category_row_id }, { _id: 1 })
      if (!found) { errObj[`${prefix}.investor_category_row_id`] = 'The investor category row id field is invalid.'; continue }
    }

    validated.push({ investor_type, investor_registered_type, investor_row_id, investor_category_row_id, investor_user_row_id })
  }

  return { errObj, validated }
}

const { getCollectionID } = require('../../utils/helpers/database_helper')
const { getPresentDateTime } = require('../../utils/helpers/helper')
const { updateNotification } = require('../../utils/helpers/notification_helper')
const { calculateUserProfileScore, calculateCompanyProfileScore } = require('../../utils/helpers/app_helper')
import { invalidateFundingCaches } from './funding.cache'
import { resolveFundsRaisedCompanyStages, resolveInvestorStages, syndicateDetectionStages, groupRoundWithInvestorsStages, getFundsRaisedOverview, joinPositionNamesExpr } from './funding.queries'
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'

/**
 * Merged funds_raised_update_details (app + admin). Insert: one new round_id
 * shared by every investor row. Update: edit-as-a-whole — deletes and re-inserts
 * the whole investors[] array, carrying forward verified_status/verified_on/
 * reject_type/reject_reason so they don't reset. Response always includes
 * save_query (admin previously didn't).
 */
export async function createOrUpdateRound(params: {
  actor: FundingActor
  funds_raised_company_row_id: number
  category_row_id: number
  announcement_date: string
  amount: number
  funding_row_id?: number
  investors: unknown[]
}) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const { errObj, validated } = await validateInvestorsArray(params.investors)
  if (Object.keys(errObj).length > 0) {
    return { status: false, message: errObj }
  }

  const sharedFields = {
    category_row_id: params.category_row_id,
    announcement_date: params.announcement_date,
    amount: params.amount || 0
  }
  const funds_raised_registered_type = 1

  if (!params.funding_row_id) {
    const present_date_n_time = getPresentDateTime()
    const new_round_id = await getCollectionID('funding_round_id')

    const save_query = []
    for (const inv of validated) {
      const doc = new fundingInvestmentM({
        ...sharedFields,
        round_id: new_round_id,
        investor_type: inv.investor_type,
        investor_registered_type: inv.investor_registered_type,
        investor_row_id: inv.investor_row_id,
        investor_category_row_id: inv.investor_category_row_id,
        funds_raised_registered_type,
        funds_raised_company_row_id: params.funds_raised_company_row_id,
        verified_status: 1,
        verified_on: present_date_n_time,
        date_n_time: present_date_n_time
      })
      save_query.push(await doc.save())
    }

    await invalidateFundingCaches()

    for (let i = 0; i < validated.length; i++) {
      const inv = validated[i]
      const saved: any = save_query[i]
      if (inv.investor_registered_type === 1 && inv.investor_user_row_id) {
        await updateNotification({ user_row_id: inv.investor_user_row_id, notify_type: 2, notify_type_row_id: params.funds_raised_company_row_id, message_row_id: 21, action_row_id: saved._id })
      }
      if (inv.investor_type === 1) {
        await calculateUserProfileScore(inv.investor_row_id, ['investment', 'funding'])
      } else {
        await calculateCompanyProfileScore(inv.investor_row_id, ['investment', 'funding'])
      }
    }
    await calculateCompanyProfileScore(params.funds_raised_company_row_id, ['funding', 'investment'])

    return { status: true, message: { alert_message: 'Congratulations! Your funding details have been successfully added', save_query } }
  }

  const existing = await fundingInvestmentM.findOne({ round_id: params.funding_row_id }, { verified_status: 1, verified_on: 1, reject_type: 1, reject_reason: 1, funds_raised_company_row_id: 1, date_n_time: 1 })
  if (!existing) {
    return { status: false, message: { alert_message: 'Invalid funding row id.' } }
  }

  // SECURITY: verify the caller is actually allowed to touch this pre-existing
  // round before deleting/reassigning it. Previously (both pre-refactor
  // originals and the first cut of this merge) only "does funding_row_id exist
  // at all" was checked — never "does it belong to the caller" — letting any
  // app user overwrite/hijack another company's round by guessing its id.
  if (params.actor.user_type === 1) {
    if (existing.funds_raised_company_row_id !== params.funds_raised_company_row_id) {
      return { status: false, message: { alert_message: 'Sorry, you do not have access to edit this funding round.' } }
    }
  } else {
    const check_access = await checkCompanySubadminAccess({
      admin_row_id: Number.parseInt(params.actor.token_message.admin_row_id),
      admin_manager_type: params.actor.token_message.admin_manager_type,
      sub_admin_type: Number.parseInt(params.actor.token_message.sub_admin_type),
      company_row_id: existing.funds_raised_company_row_id
    })
    if (!check_access.status) {
      return { status: false, message: { alert_message: check_access.message } }
    }
  }

  // BUG FIX: date_n_time (used by the dashboard's Today/Yesterday/1 Week/1 Month
  // counters) was never carried forward here — since editing a round deletes and
  // re-inserts fresh documents, every edited round permanently lost its
  // date_n_time (undefined forever, invisible to all dashboard buckets). Carry
  // it forward like the other fields; fall back to now only if it was already
  // lost by a prior edit before this fix existed.
  const carriedFields = {
    verified_status: existing ? existing.verified_status : 0,
    verified_on: existing ? existing.verified_on : undefined,
    reject_type: existing ? existing.reject_type : undefined,
    reject_reason: existing ? existing.reject_reason : undefined,
    date_n_time: existing?.date_n_time ? existing.date_n_time : getPresentDateTime()
  }

  await fundingInvestmentM.deleteMany({ round_id: params.funding_row_id })

  const save_query = []
  for (const inv of validated) {
    const doc = new fundingInvestmentM({
      ...sharedFields,
      ...carriedFields,
      round_id: params.funding_row_id,
      investor_type: inv.investor_type,
      investor_registered_type: inv.investor_registered_type,
      investor_row_id: inv.investor_row_id,
      investor_category_row_id: inv.investor_category_row_id,
      funds_raised_registered_type,
      funds_raised_company_row_id: params.funds_raised_company_row_id
    })
    save_query.push(await doc.save())
  }

  await invalidateFundingCaches()

  return { status: true, message: { alert_message: 'Great job! Your funding details have been successfully updated.', save_query } }
}

const { checkUserSubadminAccess, checkCompanySubadminAccess } = require('../../utils/helpers/helper')
const { deleteUserFunding, calculateUserProfileScore: calcUserScoreDelete, calculateCompanyProfileScore: calcCompanyScoreDelete } = require('../../utils/helpers/app_helper')

/**
 * Merged delete_funding_details (app + admin). SECURITY FIX: the old app route
 * deleted by round_id alone with no ownership check at all — any logged-in app
 * user could delete any company's round. Now an app-user actor may only delete a
 * round where they are the investor or the funds-raised company; admin actors go
 * through the existing subadmin access check (scopeType 1 = user-role, else company-role).
 */
export async function deleteRound(params: { actor: FundingActor; round_id: number; scopeType?: number }) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const round_rows = await fundingInvestmentM.find({ round_id: params.round_id })
  const first_row = round_rows[0]
  if (!first_row) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Funding Row ID' } }
  }

  // SECURITY FIX: a syndicate (multi-investor) round can only be deleted by the
  // company that raised it — never by an individual co-investor, since deleting
  // by round_id removes every investor's row, not just the caller's own. The
  // frontend already hides the delete button for this case, but nothing on the
  // backend enforced it — any co-investor could delete the whole shared round
  // (and every other investor's record with it) via a direct API call.
  const isSyndicate = round_rows.length > 1

  if (params.actor.user_type === 1) {
    // BUG FIX: funds_raised_company_row_id is always a company id, and
    // investor_row_id is a company id whenever investor_type is 2 — neither
    // can ever legitimately equal the caller's raw (professional) user_row_id.
    // This previously made every company-side delete (e.g. deleting your own
    // company's solo investment into another company) fail with "you do not
    // have access", even when the caller genuinely owned the round.
    let ownsAsInvestor = first_row.investor_type === 1 && first_row.investor_row_id === params.actor.user_row_id
    let ownsAsCompany = false
    if (!ownsAsInvestor) {
      const ownCompany = await resolveOwnCompanyId(params.actor.user_row_id)
      if (ownCompany.status) {
        const companyId = ownCompany.message as number
        if (first_row.investor_type === 2 && first_row.investor_row_id === companyId) ownsAsInvestor = true
        if (first_row.funds_raised_company_row_id === companyId) ownsAsCompany = true
      }
    } else {
      const ownCompany = await resolveOwnCompanyId(params.actor.user_row_id)
      if (ownCompany.status && first_row.funds_raised_company_row_id === ownCompany.message) ownsAsCompany = true
    }
    if (!ownsAsCompany && (isSyndicate || !ownsAsInvestor)) {
      const message = isSyndicate && ownsAsInvestor
        ? 'Sorry, this round has multiple investors and can only be deleted by the company that raised it.'
        : 'Sorry, you do not have access to delete this funding round.'
      return { status: false, message: { alert_message: message } }
    }
  } else {
    // scopeType 1/2 means the admin is acting on behalf of the investor party
    // (a person or company that invested); anything else means acting on behalf
    // of the funds-raised company. Only the latter may delete a syndicate round.
    const actingAsInvestor = params.scopeType === 1 || params.scopeType === 2
    if (isSyndicate && actingAsInvestor) {
      return { status: false, message: { alert_message: 'Sorry, this round has multiple investors and can only be deleted by the company that raised it.' } }
    }
    const check_access = params.scopeType === 1
      ? await checkUserSubadminAccess({ admin_row_id: Number.parseInt(params.actor.token_message.admin_row_id), admin_manager_type: params.actor.token_message.admin_manager_type, sub_admin_type: Number.parseInt(params.actor.token_message.sub_admin_type), user_row_id: first_row.investor_row_id })
      : await checkCompanySubadminAccess({ admin_row_id: Number.parseInt(params.actor.token_message.admin_row_id), admin_manager_type: params.actor.token_message.admin_manager_type, sub_admin_type: Number.parseInt(params.actor.token_message.sub_admin_type), company_row_id: params.scopeType === 2 ? first_row.investor_row_id : first_row.funds_raised_company_row_id })
    if (!check_access.status) {
      return { status: false, message: { alert_message: check_access.message } }
    }
  }

  await fundingInvestmentM.deleteMany({ round_id: params.round_id })
  await invalidateFundingCaches()
  await deleteUserFunding({ funding_row_id: params.round_id, type: 1 })

  for (const row of round_rows) {
    if (row.investor_type === 1) {
      await calcUserScoreDelete(row.investor_row_id, ['funding', 'investment'])
    } else {
      await calcCompanyScoreDelete(row.investor_row_id, ['funding', 'investment'])
    }
  }
  await calcCompanyScoreDelete(first_row.funds_raised_company_row_id, ['funding', 'investment'])

  return { status: true, message: { alert_message: 'Your investment funding details have been successfully deleted from your profile.' } }
}

async function resolveNotifyUserRowId(row: any): Promise<number> {
  if (row.investor_registered_type !== 1) return 0
  if (row.investor_type === 1) return row.investor_row_id
  const companyM = require('../../models/app/company/companyM')
  const company = await companyM.findOne({ _id: row.investor_row_id }, { _id: 1, user_row_id: 1 })
  return company?.user_row_id ?? 0
}

/** Merged verify_funds_raised_details (app + admin). companyScopeId, when provided, restricts to rounds raised by that company (app's ownership scope); admin omits it. */
export async function verifyRound(params: { actor: FundingActor; round_id: number; companyScopeId?: number }) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const matchFilter: any = { round_id: params.round_id, verified_status: 0 }
  if (params.companyScopeId) {
    matchFilter.funds_raised_registered_type = 1
    matchFilter.funds_raised_company_row_id = params.companyScopeId
  }
  const round_rows = await fundingInvestmentM.find(matchFilter)
  if (round_rows.length === 0) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Funding Row ID' } }
  }

  const verified_on_date = getPresentDateTime()
  await fundingInvestmentM.updateMany({ round_id: params.round_id, verified_status: 0 }, { $set: { verified_status: 1, verified_on: verified_on_date } })
  await invalidateFundingCaches()

  for (const row of round_rows) {
    const investor_user_row_id = await resolveNotifyUserRowId(row)
    if (investor_user_row_id) {
      await updateNotification({ user_row_id: investor_user_row_id, notify_type: 2, notify_type_row_id: row.funds_raised_company_row_id, message_row_id: 22, action_row_id: row._id })
    }
  }

  return { status: true, message: { alert_message: 'This funds raised details has been verified successfully.' } }
}

/** Merged reject_funds_raised_details (app + admin — folds in app's previously-undocumented duplicate). */
export async function rejectRound(params: { actor: FundingActor; round_id: number; reject_type: number; reject_reason: string; companyScopeId?: number }) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const matchFilter: any = { round_id: params.round_id, verified_status: 0 }
  if (params.companyScopeId) {
    matchFilter.funds_raised_registered_type = 1
    matchFilter.funds_raised_company_row_id = params.companyScopeId
  }
  const round_rows = await fundingInvestmentM.find(matchFilter)
  if (round_rows.length === 0) {
    return { status: false, message: { alert_message: 'Sorry, Invalid Funding Row ID' } }
  }

  const verified_on_date = getPresentDateTime()
  for (const row of round_rows) {
    const investor_user_row_id = await resolveNotifyUserRowId(row)
    if (investor_user_row_id) {
      await updateNotification({ user_row_id: investor_user_row_id, notify_type: 2, notify_type_row_id: row.funds_raised_company_row_id, message_row_id: 27, action_row_id: row._id })
    }
  }

  await fundingInvestmentM.updateMany({ round_id: params.round_id, verified_status: 0 }, { $set: { verified_status: 2, verified_on: verified_on_date, reject_type: params.reject_type, reject_reason: params.reject_reason } })
  await invalidateFundingCaches()

  return { status: true, message: { alert_message: 'This funds raised details has been rejected successfully.' } }
}

/** Escapes regex metacharacters before use in $regex — SECURITY FIX: raw user search input was previously interpolated unescaped (ReDoS / unintended-match risk). */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Merged investor_list (app + admin). Admin's version previously had no syndicate
 * detection at all — it now always runs syndicateDetectionStages(), so admin's
 * response gains is_syndicate/round_investor_count where it didn't before.
 */
export async function getInvestorList(params: { investor_type: number; investor_row_id: number; skip: number; limit: number; query: Record<string, any> }) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const { createDateTime, createEndDateOnly } = require('../../utils/helpers/helper')

  const search_query: any[] = [{ company_data: { $nin: ['', null] }, investor_type: params.investor_type, investor_registered_type: 1, investor_row_id: params.investor_row_id }]
  if (params.query.search) {
    const escaped = escapeRegex(String(params.query.search))
    search_query.push({ $or: [{ company_name: { $regex: escaped, $options: 'i' } }, { company_id: { $regex: escaped, $options: 'i' } }, { category_name: { $regex: escaped, $options: 'i' } }] })
  }
  if (params.query.start_date) search_query.push({ announcement_date: { $gte: new Date(createDateTime(params.query.start_date)) } })
  if (params.query.end_date) search_query.push({ announcement_date: { $lte: new Date(createEndDateOnly(params.query.end_date)) } })
  if (!Number.isNaN(Number.parseInt(params.query.investment_type))) search_query.push({ investor_type: Number.parseInt(params.query.investment_type) })
  if (params.query.category_row_id) search_query.push({ category_row_id: Number.parseInt(params.query.category_row_id) })
  if (params.query.investor_category_row_id) search_query.push({ investor_category_row_id: Number.parseInt(params.query.investor_category_row_id) })

  const commonStages: any[] = [
    { $sort: { announcement_date: -1 } },
    { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
    { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
    ...resolveFundsRaisedCompanyStages({ rich: true }),
    {
      $set: {
        company_name: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: '$company_info.company_name', else: '$manual_info.company_name' } },
        company_id: { $cond: { if: { $eq: ['$funds_raised_registered_type', 1] }, then: '$company_info.company_id', else: '' } },
        category_name: '$category_info.category_name'
      }
    },
    { $match: { $and: search_query } }
  ]

  const list = await fundingInvestmentM.aggregate([
    ...commonStages,
    ...syndicateDetectionStages(),
    {
      $project: {
        _id: 1, round_id: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: 1,
        company_row_id: '$company_data._id', company_name: 1, company_id: 1,
        company_approval_status: '$company_data.approval_status', company_active_status: '$company_data.active_status',
        company_email_id: '$company_data.company_email_id', website_link: '$company_data.website_link', company_logo: '$company_data.company_logo',
        investor_category_name: '$investor_category_info.category_name', announcement_date: 1, category_row_id: 1, amount: 1,
        verified_status: 1, verified_on: 1, reject_type: 1, reject_reason: 1, category_name: 1,
        round_investor_count: 1, is_syndicate: 1
      }
    }
  ]).skip(params.skip).limit(params.limit)

  const [countResult] = await fundingInvestmentM.aggregate([...commonStages, { $count: 'count' }])
  return { list, count: countResult?.count ?? 0 }
}

/**
 * Admin-only. Lists who invested in a given company's raised rounds, with
 * search/date/category filters, round-grouped with an investors[] array per
 * round (same shape as getFundsRaisedListSelf and the original admin route
 * recovered from git history — controllers/admin_panel/app/funding.js:1535-2180).
 *
 * BUG FIX: this function previously duplicated an incomplete, flat
 * per-investor-row version of this query (missing round-grouping,
 * is_syndicate/round_investor_count, and most investor display fields) —
 * causing the admin "Company Funding" list to be missing data. Since
 * getFundsRaisedListSelf already implements the correct shape, this just adds
 * the admin-specific company-existence check and delegates to it.
 */
export async function getFundsRaisedListAdmin(params: { funds_raised_company_row_id: number; skip: number; limit: number; query: Record<string, any> }): Promise<any> {
  const companyM = require('../../models/app/company/companyM')
  const check_query = await companyM.findOne({ active_status: 1, _id: params.funds_raised_company_row_id })
  if (!check_query) return null

  return getFundsRaisedListSelf(params.funds_raised_company_row_id, params.skip, params.limit, params.query)
}

/**
 * Admin-only, ported from controllers/admin_panel/app/funding.js:3904-. Global
 * funding list across all companies (not scoped to one), with search/investor_type
 * filters, sorted by most recent write.
 *
 * SYNDICATE FIX: was a flat list, one row per investor — a syndicate round with
 * 3 co-investors showed as 3 separate rows instead of 1 round listing all 3
 * investors. Now round-grouped (investors[] + is_syndicate/round_investor_count),
 * matching the shape already used elsewhere (company Funding tab, etc).
 *
 * PERF FIX: grouping by round_id first needs *some* pass over every matching
 * row, but investor identity resolution (resolveInvestorStages' 4 $lookups)
 * does not need to run on all of them — only on the handful of investors that
 * belong to the current page's rounds. Running it eagerly on the whole matching
 * set (before $group, so pagination could only happen after) is what caused the
 * DB connection to time out. Split into two phases: (1) group with only cheap
 * fields (no investor lookups) to pick the page's rounds, (2) resolve investor
 * identities only for the investor _ids on that page, then merge in memory.
 */
const EMPTY_INVESTOR_DATA = Object.freeze({ profile_image: '', full_name: '', company_logo: '', company_name: '' })

export async function getAllFundsRaisedList(params: { skip: number; limit: number; query: Record<string, any> }) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')

  // CODE REVIEW FIX: investor_type is a per-investor field, not a per-round one.
  // Hard-$matching it before $group silently dropped non-matching co-investors
  // out of a syndicate round's investors[] entirely, corrupting
  // round_investor_count/is_syndicate for that round (e.g. filtering to
  // investor_type=1 on a 2-person+1-company syndicate made it look like a
  // solo 2-person round). Only round-level attributes (company_name/company_id
  // search) are safe to hard-$match pre-group; investor_type instead marks
  // row_matches per row, $max'd to round_matches for round SELECTION only —
  // same row_matches/round_matches convention already used in
  // getFundsRaisedListSelf — while every investor stays in investors[].
  const roundLevelFilter: any[] = [{}]
  if (params.query.search) {
    const escaped = escapeRegex(String(params.query.search))
    roundLevelFilter.push({ $or: [{ company_name: { $regex: escaped, $options: 'i' } }, { company_id: { $regex: escaped, $options: 'i' } }] })
  }
  const investorTypeFilter = params.query.investor_type && [1, 2].includes(Number.parseInt(params.query.investor_type))
    ? Number.parseInt(params.query.investor_type)
    : undefined

  const matchStages: any[] = [
    { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
    { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
    ...resolveFundsRaisedCompanyStages({ rich: true }),
    { $set: { company_name: '$company_data.company_name', company_id: '$company_data.company_id' } },
    { $match: { $and: roundLevelFilter } },
    { $set: { row_matches: investorTypeFilter !== undefined ? { $eq: ['$investor_type', investorTypeFilter] } : true } }
  ]

  const groupStages: any[] = [
    ...matchStages,
    {
      $group: {
        _id: '$round_id',
        round_id: { $first: '$round_id' },
        date_n_time: { $first: '$date_n_time' },
        announcement_date: { $first: '$announcement_date' },
        amount: { $first: '$amount' },
        category_row_id: { $first: '$category_row_id' },
        category_name: { $first: '$category_info.category_name' },
        company_name: { $first: '$company_data.company_name' },
        company_id: { $first: '$company_data.company_id' },
        company_row_id: { $first: '$company_data._id' },
        company_logo: { $first: '$company_data.company_logo' },
        profile_score: { $first: '$company_data.profile_score' },
        funds_raised_registered_type: { $first: '$funds_raised_registered_type' },
        round_matches: { $max: '$row_matches' },
        investors: {
          $push: {
            _id: '$_id',
            investor_type: '$investor_type',
            investor_registered_type: '$investor_registered_type',
            investor_category_row_id: '$investor_category_row_id',
            investor_category_name: '$investor_category_info.category_name',
            verified_status: '$verified_status',
            verified_on: '$verified_on',
            reject_type: '$reject_type',
            reject_reason: '$reject_reason'
          }
        }
      }
    },
    { $match: { round_matches: true } },
    { $set: { round_investor_count: { $size: '$investors' }, is_syndicate: { $gt: [{ $size: '$investors' }, 1] } } }
  ]

  const [rounds, [countResult]] = await Promise.all([
    fundingInvestmentM.aggregate([
      ...groupStages,
      { $sort: { date_n_time: -1 } },
      { $skip: params.skip },
      { $limit: params.limit },
      {
        $project: {
          _id: 0, round_id: 1, announcement_date: 1, amount: 1, category_row_id: 1, category_name: 1,
          company_name: 1, company_id: 1, company_row_id: 1, company_logo: 1, profile_score: 1, funds_raised_registered_type: 1,
          investors: 1, round_investor_count: 1, is_syndicate: 1
        }
      }
    ]),
    fundingInvestmentM.aggregate([...groupStages, { $count: 'count' }])
  ])

  const investorIds = rounds.flatMap((r: any) => r.investors.map((inv: any) => inv._id))
  const investorDataById = new Map<number, any>()
  if (investorIds.length) {
    const enriched = await fundingInvestmentM.aggregate([
      { $match: { _id: { $in: investorIds } } },
      ...resolveInvestorStages({ rich: true }),
      {
        $set: {
          investor_data: {
            $switch: {
              branches: [
                { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$user_info' },
                { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$user_manual_info' },
                { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$company_info' },
                { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$company_manual_info' }
              ],
              default: ''
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          investor_data: {
            profile_image: { $ifNull: ['$investor_data.profile_image', ''] },
            full_name: { $ifNull: ['$investor_data.full_name', ''] },
            company_logo: { $ifNull: ['$investor_data.company_logo', ''] },
            company_name: { $ifNull: ['$investor_data.company_name', ''] }
          }
        }
      }
    ])
    for (const row of enriched) investorDataById.set(row._id, row.investor_data)
  }
  const list = rounds.map((r: any) => ({
    ...r,
    investors: r.investors.map((inv: any) => ({ ...inv, investor_data: investorDataById.get(inv._id) ?? EMPTY_INVESTOR_DATA }))
  }))

  return { list, count: countResult?.count ?? 0 }
}

/**
 * Admin-only, ported from controllers/admin_panel/app/funding.js:145-351. Admin
 * records an investment on behalf of an explicit investor_row_id (unlike
 * createInvestorUserUpdate, which always uses the caller's own identity) —
 * gated by the existing subadmin access check.
 */
export async function createInvestorUpdateAdmin(params: {
  actor: FundingActor
  investor_type: number
  investor_row_id: number
  category_row_id: number
  investor_category_row_id?: number
  announcement_date: string
  amount?: number
  funds_raised_registered_type: number
  funds_raised_company_row_id: number
  funding_row_id?: number
}) {
  const check_access = params.investor_type === 1
    ? await checkUserSubadminAccess({ admin_row_id: Number.parseInt(params.actor.token_message.admin_row_id), admin_manager_type: params.actor.token_message.admin_manager_type, sub_admin_type: Number.parseInt(params.actor.token_message.sub_admin_type), user_row_id: params.investor_row_id })
    : await checkCompanySubadminAccess({ admin_row_id: Number.parseInt(params.actor.token_message.admin_row_id), admin_manager_type: params.actor.token_message.admin_manager_type, sub_admin_type: Number.parseInt(params.actor.token_message.sub_admin_type), company_row_id: params.investor_row_id })
  if (!check_access.status) {
    return { status: false, message: { alert_message: check_access.message } }
  }

  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const companyM = require('../../models/app/company/companyM')

  let funds_raised_user_row_id = 0
  if (params.funds_raised_registered_type === 1) {
    const company_reg_query = await companyM.findOne({ _id: params.funds_raised_company_row_id, active_status: 1 }, { _id: 1, user_row_id: 1 })
    if (company_reg_query?.user_row_id) funds_raised_user_row_id = company_reg_query.user_row_id
  }

  const insertArray: any = {
    category_row_id: params.category_row_id,
    investor_category_row_id: params.investor_category_row_id || 0,
    announcement_date: params.announcement_date,
    amount: params.amount || 0
  }

  if (!params.funding_row_id) {
    const date_n_time = getPresentDateTime()
    insertArray.investor_type = params.investor_type
    insertArray.investor_registered_type = 1
    insertArray.investor_row_id = params.investor_row_id
    insertArray.funds_raised_registered_type = params.funds_raised_registered_type
    insertArray.funds_raised_company_row_id = params.funds_raised_company_row_id
    insertArray.verified_status = 1
    insertArray.verified_on = date_n_time
    insertArray.date_n_time = date_n_time
    insertArray.round_id = await getCollectionID('funding_round_id')

    const save_query = await new fundingInvestmentM(insertArray).save()
    await invalidateFundingCaches()

    if (params.funds_raised_registered_type === 1 && funds_raised_user_row_id) {
      await updateNotification({ user_row_id: funds_raised_user_row_id, notify_type: params.investor_type, notify_type_row_id: params.investor_row_id, message_row_id: 20, action_row_id: save_query._id })
    }
    if (params.investor_type === 1) {
      await calculateUserProfileScore(params.investor_row_id, ['investment', 'funding'])
    } else {
      await calculateCompanyProfileScore(params.investor_row_id, ['investment', 'funding'])
    }
    await calculateCompanyProfileScore(params.funds_raised_company_row_id, ['funding', 'investment'])

    return { status: true, message: { alert_message: 'Congratulations! Your investment details have been successfully added', save_query } }
  }

  await fundingInvestmentM.updateOne({ _id: params.funding_row_id }, { $set: insertArray })
  await invalidateFundingCaches()

  return { status: true, message: { alert_message: 'Great job! Your investment details have been successfully updated.' } }
}

/**
 * App-only, ported from controllers/app/funding.js:818-1003 ("user as investor").
 * Distinct from getIndividualDetails: this is a single-row detail view for one of
 * the caller's own investments, not a round grouped with investors[]. Always
 * scoped to the caller's own investor_row_id (never a client-supplied target).
 */
export async function getInvestorIndividualDetails(investorType: number, investorRowId: number, fundingRowId: number): Promise<any> {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const [result] = await fundingInvestmentM.aggregate([
    { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
    { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
    ...resolveFundsRaisedCompanyStages({ rich: true }),
    { $match: { _id: fundingRowId, investor_type: investorType, investor_registered_type: 1, investor_row_id: investorRowId } },
    {
      $project: {
        _id: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: 1,
        company_approval_status: '$company_data.approval_status', company_active_status: '$company_data.active_status',
        company_row_id: '$company_data._id', company_name: '$company_data.company_name', company_id: '$company_data.company_id',
        company_email_id: '$company_data.company_email_id', website_link: '$company_data.website_link', company_logo: '$company_data.company_logo',
        announcement_date: 1, category_row_id: 1, amount: 1, verified_status: 1, verified_on: 1, reject_type: 1, reject_reason: 1,
        investor_category_row_id: 1, investor_category_name: '$investor_category_info.category_name', category_name: '$category_info.category_name'
      }
    }
  ]).limit(1)
  return result ?? null
}

/**
 * App-only, ported from the deleted controllers/app/funding.js:1813-2160 (recovered
 * via git history — this endpoint was missed in the initial migration and only
 * caught by walking the actual frontend flow). Self-scoped to the caller's own
 * company. Distinct from getFundsRaisedListAdmin: this is round-grouped
 * (investors[] array), and rows are tagged with row_matches per the search/date/
 * category filters, then grouped by round_id — a round is kept if ANY investor
 * row in it matched (round_matches = $max of row_matches), so searching for one
 * co-investor's name still surfaces their round's other investors.
 */
export async function getFundsRaisedListSelf(companyRowId: number, skip: number, limit: number, query: Record<string, any>) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const { createDateTime, createEndDateOnly } = require('../../utils/helpers/helper')

  const dateFilter: any = {}
  if (query.start_date) dateFilter.$gte = new Date(createDateTime(query.start_date))
  if (query.end_date) dateFilter.$lte = new Date(createEndDateOnly(query.end_date))

  const earlyMatchStage = { $match: { funds_raised_registered_type: 1, funds_raised_company_row_id: companyRowId } }

  const resolveInvestorAndWorkStages: any[] = [
    { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
    { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'user_info',
        pipeline: [
          { $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$investor_type'] }, { $eq: [1, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } }, { login_status: 1 }] } },
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, user_name: 1, profile_image: '$img_info.profile_image', full_name: 1, email_id: 1, approval_status: 1, login_status: 1, pro_batch: 1 } }
        ]
      }
    },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_professionals_manual_retrievals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'user_manual_info',
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: [1, '$$investor_type'] }, { $eq: [2, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } } },
          { $project: { _id: 1, gender: 1, full_name: 1, email_id: 1, profile_image: 1 } }
        ]
      }
    },
    { $unwind: { path: '$user_manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        user_row_id: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$user_info._id' },
              { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$user_manual_info._id' }
            ],
            default: ''
          }
        }
      }
    },
    {
      $lookup: {
        from: 'cln_professionals_work_experiences',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', user_row_id: '$user_row_id' },
        as: 'outer_info_work',
        pipeline: [
          { $match: { $and: [{ user_row_id: { $nin: ['', null] } }, { $expr: { $and: [{ $eq: ['$user_row_id', '$$user_row_id'] }, { $eq: [1, '$$investor_type'] }, { $eq: ['$public_view', true] }, { $eq: ['$user_account_type', '$$investor_registered_type'] }] } }] } },
          { $limit: 1 },
          ...getPositionResolutionStages(),
          { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
          { $lookup: { from: 'cln_company_lists', let: { company_type: '$company_type', company_row_id: '$company_row_id' }, as: 'info_company', pipeline: [{ $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }, { $project: { _id: 1, company_name: 1 } }] } },
          { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_company_manual_retrievals', let: { company_type: '$company_type', company_row_id: '$company_row_id' }, as: 'info_manual_company', pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } }, { $project: { _id: 1, company_name: 1 } }] } },
          { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
          { $project: { position_name: '$resolved_position_name', company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } } } }
        ]
      }
    },
    { $unwind: { path: '$outer_info_work', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'company_info',
        pipeline: [
          { $match: { $and: [{ $expr: { $and: [{ $eq: [2, '$$investor_type'] }, { $eq: [1, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } }, { active_status: 1 }] } },
          { $project: { _id: 1, company_id: 1, company_logo: 1, company_name: 1, company_email_id: 1, website_link: 1, active_status: 1, approval_status: 1 } }
        ]
      }
    },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cln_company_manual_retrievals',
        let: { investor_type: '$investor_type', investor_registered_type: '$investor_registered_type', investor_row_id: '$investor_row_id' },
        as: 'company_manual_info',
        pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$investor_type'] }, { $eq: [2, '$$investor_registered_type'] }, { $eq: ['$_id', '$$investor_row_id'] }] } } }]
      }
    },
    { $unwind: { path: '$company_manual_info', preserveNullAndEmptyArrays: true } },
    {
      $set: {
        investor_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$user_manual_info' },
              { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$company_info' },
              { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$company_manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    { $set: { investor_name: { $cond: { if: '$investor_data.full_name', then: '$investor_data.full_name', else: '$investor_data.company_name' } }, category_name: '$category_info.category_name' } }
  ]

  const investorResolvedStage = { $match: { $expr: { $not: [{ $in: ['$investor_data', ['', null]] }] } } }

  const matchExprStages: any[] = []
  if (query.search) {
    const escaped = escapeRegex(String(query.search))
    matchExprStages.push({ $or: [{ $regexMatch: { input: { $ifNull: ['$investor_name', ''] }, regex: escaped, options: 'i' } }, { $regexMatch: { input: { $ifNull: ['$category_name', ''] }, regex: escaped, options: 'i' } }] })
  }
  if (dateFilter.$gte) matchExprStages.push({ $gte: ['$announcement_date', dateFilter.$gte] })
  if (dateFilter.$lte) matchExprStages.push({ $lte: ['$announcement_date', dateFilter.$lte] })
  if (!Number.isNaN(Number.parseInt(query.investment_type))) matchExprStages.push({ $eq: ['$investor_type', Number.parseInt(query.investment_type)] })
  if (query.category_row_id) matchExprStages.push({ $eq: ['$category_row_id', Number.parseInt(query.category_row_id)] })

  const rowMatchStage = {
    $set: {
      row_matches: {
        $and: [
          { $eq: ['$funds_raised_registered_type', 1] },
          { $eq: ['$funds_raised_company_row_id', companyRowId] },
          ...matchExprStages
        ]
      }
    }
  }

  const groupByRoundStage = {
    $group: {
      _id: '$round_id',
      round_id: { $first: '$round_id' },
      announcement_date: { $first: '$announcement_date' },
      amount: { $first: '$amount' },
      category_row_id: { $first: '$category_row_id' },
      category_name: { $first: '$category_name' },
      round_matches: { $max: '$row_matches' },
      investors: {
        $push: {
          _id: '$_id',
          verified_status: '$verified_status',
          verified_on: '$verified_on',
          investor_type: '$investor_type',
          investor_registered_type: '$investor_registered_type',
          reject_type: '$reject_type',
          reject_reason: '$reject_reason',
          investor_position_name: { $cond: { if: '$outer_info_work.position_name', then: '$outer_info_work.position_name', else: '' } },
          investor_company_name: { $cond: { if: '$outer_info_work.company_name', then: '$outer_info_work.company_name', else: '' } },
          investor_image: { $cond: { if: '$investor_data.profile_image', then: '$investor_data.profile_image', else: '$investor_data.company_logo' } },
          investor_name: { $cond: { if: '$investor_data.full_name', then: '$investor_data.full_name', else: '$investor_data.company_name' } },
          investor_email_id: { $cond: { if: '$investor_data.email_id', then: '$investor_data.email_id', else: '$investor_data.company_email_id' } },
          investor_category_name: '$investor_category_info.category_name',
          investor_category_row_id: '$investor_category_row_id'
        }
      }
    }
  }

  const list = await fundingInvestmentM.aggregate([
    earlyMatchStage,
    ...resolveInvestorAndWorkStages,
    investorResolvedStage,
    rowMatchStage,
    groupByRoundStage,
    { $match: { round_matches: true } },
    { $sort: { amount: -1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: { _id: 0, round_id: 1, announcement_date: 1, amount: 1, category_row_id: 1, category_name: 1, investors: 1 } }
  ])

  const [countResult] = await fundingInvestmentM.aggregate([
    earlyMatchStage,
    ...resolveInvestorAndWorkStages,
    investorResolvedStage,
    rowMatchStage,
    groupByRoundStage,
    { $match: { round_matches: true } },
    { $count: 'count' }
  ])

  return { list, count: countResult?.count ?? 0 }
}

/**
 * App-only, ported from the deleted controllers/app/funding.js:3163-3746 (recovered
 * via git history). Distinct from getInvestorOverview (which just returns
 * {total_amount}) — this is a richer overview used by the "Total Investment"
 * card on the Investments tab: total_funds_invested, total_unique_funding_rounds,
 * total_unique_invested_companies, and unique_invested_companies_list, all
 * EXCLUDING syndicate investments (rounds with more than one investor) via the
 * same round_investor_rows self-lookup used elsewhere. The original route had
 * NO auth check at all — fully public, given explicit investor_type/investor_row_id.
 */
export async function getInvestorOverviewDetailed(investorType: number, investorRowId: number) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const baseMatch = { verified_status: 1, investor_registered_type: 1, investor_type: investorType, investor_row_id: investorRowId }

  const result: any = {
    total_funds_invested: 0,
    total_unique_funding_rounds: 0,
    total_unique_invested_companies: 0,
    unique_invested_companies_list: []
  }

  const [fundsInvested] = await fundingInvestmentM.aggregate([
    { $match: baseMatch },
    ...resolveFundsRaisedCompanyStages({ rich: true }),
    ...syndicateDetectionStages(),
    { $match: { $expr: { $lte: [{ $size: '$round_investor_rows' }, 1] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ])
  if (fundsInvested?.total) result.total_funds_invested = fundsInvested.total

  const resolveFundsRaisedIdStage = {
    $set: {
      investor_data: {
        $switch: {
          branches: [
            { case: { $eq: ['$funds_raised_registered_type', 1] }, then: '$company_info._id' },
            { case: { $eq: ['$funds_raised_registered_type', 2] }, then: '$funds_raised_company_row_id' }
          ],
          default: 0
        }
      }
    }
  }

  const [fundingRoundsCount] = await fundingInvestmentM.aggregate([
    { $match: baseMatch },
    { $lookup: { from: 'cln_company_lists', let: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' }, as: 'company_info', pipeline: [{ $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } }, { active_status: 1 }] } }, { $project: { _id: 1, company_id: 1 } }] } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    resolveFundsRaisedIdStage,
    { $match: { investor_data: { $gt: 0 } } },
    { $group: { _id: '$category_row_id', total: { $sum: 1 } } },
    { $count: 'count' }
  ])
  if (fundingRoundsCount?.count) result.total_unique_funding_rounds = fundingRoundsCount.count

  const [investedCompaniesCount] = await fundingInvestmentM.aggregate([
    { $match: baseMatch },
    { $lookup: { from: 'cln_company_lists', let: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' }, as: 'company_info', pipeline: [{ $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } }, { active_status: 1 }] } }, { $project: { _id: 1, company_id: 1 } }] } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    resolveFundsRaisedIdStage,
    { $match: { investor_data: { $gt: 0 } } },
    { $group: { _id: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' } } },
    { $count: 'count' }
  ])
  if (investedCompaniesCount?.count) result.total_unique_invested_companies = investedCompaniesCount.count

  result.unique_invested_companies_list = await fundingInvestmentM.aggregate([
    { $match: baseMatch },
    ...syndicateDetectionStages(),
    { $match: { $expr: { $lte: [{ $size: '$round_investor_rows' }, 1] } } },
    { $group: { _id: { funds_raised_registered_type: '$funds_raised_registered_type', funds_raised_company_row_id: '$funds_raised_company_row_id' }, total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
    { $lookup: { from: 'cln_company_lists', let: { funds_raised_registered_type: '$_id.funds_raised_registered_type', funds_raised_company_row_id: '$_id.funds_raised_company_row_id' }, as: 'company_info', pipeline: [{ $match: { $and: [{ $expr: { $and: [{ $eq: [1, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } }, { active_status: 1 }] } }, { $project: { _id: 1, company_id: 1, company_logo: 1, company_name: 1, company_email_id: 1, website_link: 1, active_status: 1, approval_status: 1 } }] } },
    { $unwind: { path: '$company_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_company_manual_retrievals', let: { funds_raised_registered_type: '$_id.funds_raised_registered_type', funds_raised_company_row_id: '$_id.funds_raised_company_row_id' }, as: 'manual_info', pipeline: [{ $match: { $expr: { $and: [{ $eq: [2, '$$funds_raised_registered_type'] }, { $eq: ['$_id', '$$funds_raised_company_row_id'] }] } } }] } },
    { $unwind: { path: '$manual_info', preserveNullAndEmptyArrays: true } },
    { $set: { company_data: { $cond: { if: { $eq: ['$_id.funds_raised_registered_type', 1] }, then: '$company_info', else: '$manual_info' } } } },
    { $match: { company_data: { $nin: ['', null] } } },
    { $project: { _id: 1, total: 1, company_name: '$company_data.company_name', company_id: '$company_data.company_id' } }
  ])

  return result
}

/** Merged investor_overview (app + admin) — identical aggregation, caller resolves investor_row_id differently (own vs. URL param). */
export async function getInvestorOverview(investorType: number, investorRowId: number): Promise<{ total_amount: number }> {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const [sumResult] = await fundingInvestmentM.aggregate([
    { $match: { investor_type: investorType, investor_registered_type: 1, investor_row_id: investorRowId } },
    ...resolveFundsRaisedCompanyStages({ rich: false }),
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ])
  return { total_amount: sumResult?.total ?? 0 }
}

/** Merged funds_raised_individual_details (app + admin). companyScopeId restricts to app's own-company ownership; admin omits it. */
export async function getIndividualDetails(roundId: number, companyScopeId?: number): Promise<any> {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const matchFilter: any = { round_id: roundId }
  if (companyScopeId) {
    matchFilter.funds_raised_registered_type = 1
    matchFilter.funds_raised_company_row_id = companyScopeId
  }
  const [result] = await fundingInvestmentM.aggregate([
    { $match: matchFilter },
    { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
    { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
    ...resolveInvestorStages({ rich: true }),
    {
      $set: {
        investor_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$user_manual_info' },
              { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$company_info' },
              { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$company_manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    { $match: { investor_data: { $nin: ['', null] } } },
    {
      $project: {
        _id: 1, round_id: 1, verified_status: 1, verified_on: 1, investor_row_id: 1, investor_type: 1, investor_registered_type: 1,
        announcement_date: 1, category_row_id: 1, reject_type: 1, reject_reason: 1,
        investor_image: { $cond: { if: '$investor_data.profile_image', then: '$investor_data.profile_image', else: '$investor_data.company_logo' } },
        investor_name: { $cond: { if: '$investor_data.full_name', then: '$investor_data.full_name', else: '$investor_data.company_name' } },
        investor_email_id: { $cond: { if: '$investor_data.email_id', then: '$investor_data.email_id', else: '$investor_data.company_email_id' } },
        // BUG FIX: investor_data.company_name means two different things depending
        // on investor_type — for a professional (1) it's their work-experience
        // employer name (correct "Works at X"); for a company investor (2),
        // investor_data IS the company itself, so investor_data.company_name is
        // the company's OWN name, not an employer. Without gating on investor_type,
        // a company investor was shown as "Works at <its own name>". Only
        // professionals (investor_type 1) ever have a real employer to show.
        investor_position_name: { $cond: { if: { $eq: ['$investor_type', 1] }, then: { $ifNull: ['$investor_data.position_name', ''] }, else: '' } },
        investor_company_name: { $cond: { if: { $eq: ['$investor_type', 1] }, then: { $ifNull: ['$investor_data.company_name', ''] }, else: '' } },
        amount: 1, investor_category_row_id: 1,
        investor_category_name: '$investor_category_info.category_name', category_name: '$category_info.category_name'
      }
    },
    ...groupRoundWithInvestorsStages()
  ])
  return result ?? null
}

/**
 * Admin-only. Ported from the deleted controllers/admin_panel/app/funding.js
 * (recovered via git history, investor_individual_details/:funding_row_id) —
 * this route got replaced during the refactor by an app-only, self-scoped
 * route of a different shape (investor_individual_details/:investor_type/:funding_row_id),
 * which admin cannot use (it resolves "self" from the caller's own login).
 * This is the single-record lookup the admin "Edit Investment" form needs:
 * given one investment document's own _id, return the funds-raised company's
 * details (company_name/company_logo/company_email_id/etc) alongside the
 * investment's own fields. Distinct from getIndividualDetails, which looks up
 * by round_id and groups all investors in that round.
 */
export async function getInvestorIndividualDetailsAdmin(fundingRowId: number): Promise<any> {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const [result] = await fundingInvestmentM.aggregate([
    { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
    { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
    ...resolveFundsRaisedCompanyStages({ rich: true }),
    { $match: { _id: fundingRowId, investor_registered_type: 1 } },
    {
      $project: {
        _id: 1, verified_status: 1, verified_on: 1, reject_type: 1, reject_reason: 1,
        funds_raised_registered_type: 1, funds_raised_company_row_id: 1,
        company_approval_status: '$company_data.approval_status', company_active_status: '$company_data.active_status',
        company_row_id: '$company_data._id', company_name: '$company_data.company_name', company_id: '$company_data.company_id',
        company_email_id: '$company_data.company_email_id', website_link: '$company_data.website_link', company_logo: '$company_data.company_logo',
        announcement_date: 1, category_row_id: 1, amount: 1, investor_category_row_id: 1,
        investor_category_name: '$investor_category_info.category_name', category_name: '$category_info.category_name'
      }
    },
    { $limit: 1 }
  ])
  return result ?? null
}

/**
 * Moved from controllers/app/company/front_page.js — URL stays where it is
 * (mounted via the same fundingRouter handler, per the confirmed option (a)).
 * Collapses company_invested_funds_query + funds_investment_list_query's shared
 * base filter (investor_type:2, investor_registered_type:1, investor_row_id) into
 * one $facet (brief perf item #10).
 */
export async function getCompanyFundingDetails(companyRowId: number, query: Record<string, any>): Promise<any> {
  const companyM = require('../../models/app/company/companyM')
  const exists = await companyM.findOne({ _id: companyRowId, approval_status: 1, active_status: 1 }, { _id: 1 })
  if (!exists) return null

  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const { createDateTime, createEndDateOnly } = require('../../utils/helpers/helper')

  let sort_order: any = { announcement_date: -1 }
  if (!Number.isNaN(Number.parseInt(query.sort_order))) {
    sort_order = Number.parseInt(query.sort_order) === 1 ? { amount: -1 } : Number.parseInt(query.sort_order) === 2 ? { amount: 1 } : sort_order
  }

  const investment_search_query: any[] = [{}]
  const raised_search_query: any[] = [{ verified_status: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: companyRowId }]
  if (query.investor_type == 1) {
    if (query.start_date) raised_search_query.push({ announcement_date: { $gte: new Date(createDateTime(query.start_date)) } })
    if (query.end_date) raised_search_query.push({ announcement_date: { $lte: new Date(createEndDateOnly(query.end_date)) } })
    if (!Number.isNaN(Number.parseInt(query.raised_investor_type))) raised_search_query.push({ investor_type: Number.parseInt(query.raised_investor_type) })
    if (query.category_row_id) raised_search_query.push({ category_row_id: Number.parseInt(query.category_row_id) })
  } else if (query.investor_type == 2) {
    if (query.start_date) investment_search_query.push({ announcement_date: { $gte: new Date(createDateTime(query.start_date)) } })
    if (query.end_date) investment_search_query.push({ announcement_date: { $lte: new Date(createEndDateOnly(query.end_date)) } })
    if (query.category_row_id) investment_search_query.push({ category_row_id: Number.parseInt(query.category_row_id) })
    if (query.investor_category_row_id) investment_search_query.push({ investor_category_row_id: Number.parseInt(query.investor_category_row_id) })
  }

  const investedBaseMatch = { verified_status: 1, investor_type: 2, investor_registered_type: 1, investor_row_id: companyRowId }
  const [investedFacet] = await fundingInvestmentM.aggregate([
    { $match: investedBaseMatch },
    ...resolveFundsRaisedCompanyStages({ rich: false }),
    {
      $facet: {
        total: [{ $group: { _id: null, total: { $sum: '$amount' } } }],
        list: [
          { $match: { $and: investment_search_query } },
          { $sort: sort_order },
          // BUG FIX: these two lookups + the final $project were missing entirely,
          // so category_name/investor_category_name/company_name/company_id (and
          // every other display field the frontend reads) were always undefined —
          // this is the "missing names" bug reported live.
          { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
          { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
          { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
          ...resolveFundsRaisedCompanyStages({ rich: true }),
          ...syndicateDetectionStages(),
          {
            $project: {
              _id: 1, round_id: 1, investor_row_id: 1, investor_type: 1, investor_registered_type: 1, investor_category_row_id: 1,
              funds_raised_registered_type: 1, funds_raised_company_row_id: 1,
              active_status: '$company_data.active_status', company_approval_status: '$company_data.approval_status',
              company_row_id: '$company_data._id', company_name: '$company_data.company_name', company_id: '$company_data.company_id',
              company_email_id: '$company_data.company_email_id', website_link: '$company_data.website_link', company_logo: '$company_data.company_logo',
              announcement_date: 1, category_row_id: 1, amount: 1,
              investor_category_name: '$investor_category_info.category_name', category_name: '$category_info.category_name',
              round_investor_count: 1, is_syndicate: 1
            }
          }
        ]
      }
    }
  ])

  const raised_total = await getFundsRaisedOverview(companyRowId)
  const raised_list = await fundingInvestmentM.aggregate([
    { $match: { $and: raised_search_query } },
    { $sort: sort_order },
    { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
    { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
    ...resolveInvestorStages({ rich: true }),
    // BUG FIX: this $set + $project (resolving investor_data from the 4 branches,
    // then computing investor_name/investor_image/investor_position_name/etc.) was
    // missing entirely — groupRoundWithInvestorsStages() only maps *existing* field
    // names into the investors[] array, it doesn't compute them. Without this step
    // every investor display field was undefined ("missing names" bug).
    {
      $set: {
        investor_data: {
          $switch: {
            branches: [
              { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$user_info' },
              { case: { $and: [{ $eq: ['$investor_type', 1] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$user_manual_info' },
              { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 1] }] }, then: '$company_info' },
              { case: { $and: [{ $eq: ['$investor_type', 2] }, { $eq: ['$investor_registered_type', 2] }] }, then: '$company_manual_info' }
            ],
            default: ''
          }
        }
      }
    },
    { $match: { investor_data: { $nin: ['', null] } } },
    {
      $project: {
        _id: 1, round_id: 1, investor_row_id: 1, investor_type: 1, investor_registered_type: 1,
        announcement_date: 1, category_row_id: 1, amount: 1,
        category_name: '$category_info.category_name',
        // BUG FIX: same class of issue as getIndividualDetails above — gate on
        // investor_type so a company investor doesn't show a fake "Works at
        // <its own name>" derived from its own company_name field.
        investor_position_name: { $cond: { if: { $eq: ['$investor_type', 1] }, then: { $ifNull: ['$investor_data.position_name', ''] }, else: '' } },
        investor_company_name: { $cond: { if: { $eq: ['$investor_type', 1] }, then: { $ifNull: ['$investor_data.company_name', ''] }, else: '' } },
        investor_id: { $cond: { if: '$investor_data.user_name', then: '$investor_data.user_name', else: '$investor_data.company_id' } },
        investor_approval_status: { $cond: { if: '$investor_data.approval_status', then: '$investor_data.approval_status', else: 0 } },
        investor_image: { $cond: { if: '$investor_data.profile_image', then: '$investor_data.profile_image', else: '$investor_data.company_logo' } },
        investor_name: { $cond: { if: '$investor_data.full_name', then: '$investor_data.full_name', else: '$investor_data.company_name' } },
        investor_email_id: { $cond: { if: '$investor_data.email_id', then: '$investor_data.email_id', else: '$investor_data.company_email_id' } },
        investor_category_name: '$investor_category_info.category_name',
        investor_category_row_id: 1
      }
    },
    {
      $group: {
        _id: '$round_id',
        round_id: { $first: '$round_id' },
        announcement_date: { $first: '$announcement_date' },
        amount: { $first: '$amount' },
        category_row_id: { $first: '$category_row_id' },
        category_name: { $first: '$category_name' },
        investors: {
          $push: {
            _id: '$_id',
            investor_row_id: '$investor_row_id',
            investor_type: '$investor_type',
            investor_registered_type: '$investor_registered_type',
            investor_position_name: '$investor_position_name',
            investor_company_name: '$investor_company_name',
            investor_id: '$investor_id',
            investor_approval_status: '$investor_approval_status',
            investor_image: '$investor_image',
            investor_name: '$investor_name',
            investor_email_id: '$investor_email_id',
            investor_category_name: '$investor_category_name',
            investor_category_row_id: '$investor_category_row_id'
          }
        }
      }
    },
    { $sort: sort_order },
    { $project: { _id: 0, round_id: 1, announcement_date: 1, amount: 1, category_row_id: 1, category_name: 1, investors: 1 } }
  ])

  return {
    company_invested_funds: investedFacet?.total?.[0]?.total ?? 0,
    funds_investment_list: investedFacet?.list ?? [],
    company_raised_funds: raised_total.total_usd_value,
    funds_raised_list: raised_list
  }
}

/** Admin dashboard stats — no merge, admin-only, ported as-is. */
export async function getDashboardFundingStats() {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const { getPresentDateOnly, yesterDayStartNEndDate, getMinusDates } = require('../../utils/helpers/helper')
  const today_date = getPresentDateOnly()
  const { start_date, end_date } = yesterDayStartNEndDate(1)
  const week_date = getMinusDates(7)
  const one_month_date = getMinusDates(30)

  // SYNDICATE FIX: countDocuments counted raw investor rows — a syndicate round
  // with 3 co-investors counted as 3, inflating these totals relative to the
  // actual number of funding rounds added. Count distinct round_ids instead, same
  // round-based convention used everywhere else in this module (e.g.
  // getFundsRaisedOverview's total_unique_funding_rounds).
  const countDistinctRounds = (filter: Record<string, any>): Promise<number> =>
    fundingInvestmentM.aggregate([{ $match: filter }, { $group: { _id: '$round_id' } }, { $count: 'count' }])
      .then((rows: any[]) => rows[0]?.count ?? 0)

  const [today_funding, yesterday_funding, week_total_funding, month_total_funding] = await Promise.all([
    countDistinctRounds({ date_n_time: { $gte: new Date(today_date) } }),
    countDistinctRounds({ date_n_time: { $gte: new Date(start_date), $lte: new Date(end_date) } }),
    countDistinctRounds({ date_n_time: { $gte: new Date(week_date) } }),
    countDistinctRounds({ date_n_time: { $gte: new Date(one_month_date) } })
  ])
  return { today_funding, yesterday_funding, week_total_funding, month_total_funding }
}

/**
 * App-only, ported from controllers/app/funding.js:39-318. Purely round-based:
 * validates each row has a resolvable investor, then collapses to one row per
 * (month, round_id) so a syndicate round's shared amount is counted exactly once.
 * Investor names are collected per round for hover display only — no dollar
 * amount is attributed per investor.
 */
export async function getFundingGraph(companyRowId: number, filterYears: number) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  let matchStage: any = { verified_status: 1, funds_raised_company_row_id: companyRowId }

  if (filterYears > 0) {
    const latestDateDoc = await fundingInvestmentM.findOne(matchStage)
      .sort({ announcement_date: -1 })
      .select({ announcement_date: 1 })
      .lean()
    if (latestDateDoc?.announcement_date) {
      const latestYear = new Date(latestDateDoc.announcement_date).getUTCFullYear()
      const cutoffYear = latestYear - filterYears + 1
      const cutoffDate = new Date(`${cutoffYear}-01-01T00:00:00.000Z`)
      matchStage = { ...matchStage, announcement_date: { $gte: cutoffDate } }
    }
  }

  const monthly_rounds_query = await fundingInvestmentM.aggregate([
    { $match: matchStage },
    { $set: { yearMonth: { $dateToString: { format: '%Y-%m', date: '$announcement_date' } } } },
    ...resolveInvestorStages({ rich: false }),
    {
      $set: {
        // BUG FIX: resolveInvestorStages() already $unwinds each lookup to a single
        // object, unlike the original hand-rolled pipeline which left them as
        // arrays. $arrayElemAt on an already-unwound field crashes the aggregation
        // (MongoDB requires an array argument) — this is a direct field reference now.
        investor_name: {
          $ifNull: [
            '$user_info.full_name',
            { $ifNull: ['$user_manual_info.full_name', { $ifNull: ['$company_info.company_name', '$company_manual_info.company_name'] }] }
          ]
        }
      }
    },
    {
      $group: {
        _id: { yearMonth: '$yearMonth', round_id: '$round_id' },
        amount: { $first: '$amount' },
        investor_names: { $addToSet: '$investor_name' }
      }
    },
    {
      $group: {
        _id: '$_id.yearMonth',
        total_fund: { $sum: '$amount' },
        round_count: { $sum: 1 },
        investor_name_groups: { $push: '$investor_names' }
      }
    },
    { $set: { investor_names: { $reduce: { input: '$investor_name_groups', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, month: '$_id', total_fund: 1, round_count: 1, investor_names: 1 } }
  ])

  return { unique_investors_list: monthly_rounds_query }
}

/**
 * App-only, ported from controllers/app/funding.js:322-552. Excludes syndicate
 * investments (rounds with more than one investor) entirely — same rule as
 * investor_overview's total_funds_invested. Intentional, not a bug: a self-lookup
 * on round_id counts how many investor rows share each round; only solo
 * investments (count <= 1) are included.
 */
export async function getInvestmentGraph(investorType: number, investorRowId: number, filterYears: number) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  let cutoffDate: Date | null = null

  if (filterYears > 0) {
    const latestDateDoc = await fundingInvestmentM.findOne({ verified_status: 1, investor_registered_type: 1, investor_type: investorType, investor_row_id: investorRowId })
      .sort({ announcement_date: -1 })
      .select({ announcement_date: 1 })
    if (latestDateDoc?.announcement_date) {
      const latestYear = new Date(latestDateDoc.announcement_date).getFullYear()
      const cutoffYear = latestYear - filterYears + 1
      cutoffDate = new Date(`${cutoffYear}-01-01`)
    }
  }

  const matchStage: any = { verified_status: 1, investor_registered_type: 1, investor_type: investorType, investor_row_id: investorRowId }
  if (cutoffDate) matchStage.announcement_date = { $gte: cutoffDate }

  const unique_invested_companies_query = await fundingInvestmentM.aggregate([
    { $match: matchStage },
    { $set: { yearMonth: { $dateToString: { format: '%Y-%m', date: '$announcement_date' } } } },
    // rich: true is required here (not false) — this stage needs company_name,
    // which "light" mode strips from its $project (only _id). Using rich:false
    // silently made company_name always undefined, so the "must resolve to a
    // real company" $match below dropped every row — investment_graph was
    // always empty regardless of real data. Confirmed live: a company with 5
    // real non-syndicate investments still returned investment_graph: [].
    ...resolveFundsRaisedCompanyStages({ rich: true }).slice(0, 4),
    {
      $set: {
        // BUG FIX: same class of issue as getFundingGraph above — company_info/manual_info
        // are already unwound to single objects by resolveFundsRaisedCompanyStages(),
        // so $arrayElemAt (which requires an array) crashes the aggregation.
        company_name: { $ifNull: ['$company_info.company_name', '$manual_info.company_name'] }
      }
    },
    { $match: { $and: [{ company_name: { $ne: null } }, { company_name: { $ne: '' } }] } },
    {
      $lookup: {
        from: 'cln_funding_investment_lists',
        let: { round_id: '$round_id' },
        as: 'round_investor_rows',
        pipeline: [{ $match: { $expr: { $eq: ['$round_id', '$$round_id'] } } }, { $project: { _id: 1 } }]
      }
    },
    { $match: { $expr: { $lte: [{ $size: '$round_investor_rows' }, 1] } } },
    { $group: { _id: { yearMonth: '$yearMonth', company_name: '$company_name' }, amount: { $sum: '$amount' } } },
    { $group: { _id: '$_id.yearMonth', total_fund: { $sum: '$amount' }, companies: { $push: { company_name: '$_id.company_name', amount: '$amount' } } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, month: '$_id', total_fund: 1, companies: 1 } }
  ])

  return { investment_graph: unique_invested_companies_query }
}

/**
 * App-only, ported from controllers/app/funding.js:620-814 ("user as investor").
 * Distinct from createOrUpdateRound: this is for a user/company recording an
 * investment they made, not a company recording funds it raised. investor_row_id
 * is always the caller's own resolved identity (self, or the caller's own company
 * when investor_type=2) — never a client-supplied target.
 */
export async function createInvestorUserUpdate(params: {
  actor: FundingActor
  investor_type: number
  category_row_id: number
  investor_category_row_id?: number
  announcement_date: string
  amount?: number
  funds_raised_registered_type: number
  funds_raised_company_row_id: number
  funding_row_id?: number
}) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')
  const companyM = require('../../models/app/company/companyM')

  let investor_row_id = params.actor.user_row_id
  if (params.investor_type === 2) {
    const ownCompany = await companyM.findOne({ user_row_id: params.actor.user_row_id, approval_status: 1, active_status: 1 }, { _id: 1 })
    if (!ownCompany) {
      return { status: false, message: { alert_message: 'Sorry, Company not listed.' } }
    }
    investor_row_id = ownCompany._id
  }

  let funds_raised_user_row_id = 0
  if (params.funds_raised_registered_type === 1) {
    const company_reg_query = await companyM.findOne({ _id: params.funds_raised_company_row_id, active_status: 1 }, { _id: 1, user_row_id: 1 })
    if (!company_reg_query) {
      return { status: false, message: { investor_row_id: 'Sorry, Invalid registered company row id' } }
    }
    if (company_reg_query.user_row_id) funds_raised_user_row_id = company_reg_query.user_row_id
  }

  const insertArray: any = {
    category_row_id: params.category_row_id,
    investor_category_row_id: params.investor_category_row_id || 0,
    announcement_date: params.announcement_date,
    amount: params.amount ? Number.parseInt(String(params.amount)) : 0
  }

  if (!params.funding_row_id) {
    insertArray.investor_type = params.investor_type
    insertArray.investor_registered_type = 1
    insertArray.investor_row_id = investor_row_id
    insertArray.funds_raised_registered_type = params.funds_raised_registered_type
    insertArray.funds_raised_company_row_id = params.funds_raised_company_row_id
    insertArray.verified_status = 0
    insertArray.date_n_time = getPresentDateTime()

    const existing_round_query = await fundingInvestmentM.findOne(
      { funds_raised_registered_type: params.funds_raised_registered_type, funds_raised_company_row_id: params.funds_raised_company_row_id, announcement_date: params.announcement_date, category_row_id: params.category_row_id },
      { round_id: 1 }
    )
    insertArray.round_id = existing_round_query?.round_id ?? (await getCollectionID('funding_round_id'))

    const save_query = await new fundingInvestmentM(insertArray).save()
    await invalidateFundingCaches()

    if (params.funds_raised_registered_type === 1 && funds_raised_user_row_id) {
      await updateNotification({ user_row_id: funds_raised_user_row_id, notify_type: params.investor_type, notify_type_row_id: investor_row_id, message_row_id: 20, action_row_id: save_query._id })
    }
    if (params.investor_type === 1) {
      await calculateUserProfileScore(investor_row_id, ['investment', 'funding'])
    } else {
      await calculateCompanyProfileScore(investor_row_id, ['investment', 'funding'])
    }
    await calculateCompanyProfileScore(params.funds_raised_company_row_id, ['funding', 'investment'])

    return { status: true, message: { alert_message: 'Congratulations! Your investment funding details have been successfully added', save_query } }
  }

  await fundingInvestmentM.updateOne({ _id: params.funding_row_id }, { $set: insertArray })
  await invalidateFundingCaches()

  return { status: true, message: { alert_message: 'Great job! Your investment funding details have been successfully updated.' } }
}

/** Admin-only, ported from controllers/admin_panel/app/funding.js:993-1243. Scopes to manually-entered investors (investor_registered_type: 2) — investors who never signed up on the platform. */
export async function getManualInvestorList(params: { investor_type: number; investor_row_id: number; skip: number; limit: number; query: Record<string, any> }) {
  const fundingInvestmentM = require('../../models/app/funding/fundingInvestmentM')

  const commonStages: any[] = [
    { $lookup: { from: 'cln_static_company_funding_rounds', localField: 'category_row_id', foreignField: '_id', as: 'category_info' } },
    { $unwind: { path: '$category_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_static_funding_investor_types', localField: 'investor_category_row_id', foreignField: '_id', as: 'investor_category_info', pipeline: [{ $project: { category_name: 1 } }] } },
    { $unwind: { path: '$investor_category_info', preserveNullAndEmptyArrays: true } },
    ...resolveFundsRaisedCompanyStages({ rich: true }),
    { $match: { investor_type: params.investor_type, investor_registered_type: 2, investor_row_id: params.investor_row_id } }
  ]

  const list = await fundingInvestmentM.aggregate([
    { $sort: { _id: -1 } },
    ...commonStages,
    {
      $project: {
        _id: 1, verified_status: 1, verified_on: 1, funds_raised_registered_type: 1, funds_raised_company_row_id: 1,
        reject_type: 1, reject_reason: 1, company_approval_status: '$company_data.approval_status', company_active_status: '$company_data.active_status',
        company_row_id: '$company_data._id', company_name: '$company_data.company_name', company_id: '$company_data.company_id',
        company_email_id: '$company_data.company_email_id', website_link: '$company_data.website_link', company_logo: '$company_data.company_logo',
        announcement_date: 1, category_row_id: 1, amount: 1,
        investor_category_name: '$investor_category_info.category_name', category_name: '$category_info.category_name'
      }
    }
  ]).skip(params.skip).limit(params.limit)

  const [countResult] = await fundingInvestmentM.aggregate([...commonStages, { $count: 'count' }])
  return { list, count: countResult?.count ?? 0 }
}