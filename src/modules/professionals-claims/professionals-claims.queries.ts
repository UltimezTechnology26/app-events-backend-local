// modules/professionals-claims/professionals-claims.queries.ts
// Ported from controllers/admin_panel/app/user.js (~3928-4535).
import { getPositionResolutionStages } from '../work-experience/work-experience.queries'
import { joinPositionNamesExpr } from '../funding/funding.queries'

function buildSearchOr(search: string) {
  return { $or: [{ user_name: { $regex: search, $options: 'i' } }, { full_name: { $regex: search, $options: 'i' } }, { email_id: { $regex: search, $options: 'i' } }] }
}

const PENDING_INFO_WORK_PIPELINE: object[] = [
  { $match: { public_view: true, user_account_type: 1 } },
  ...getPositionResolutionStages(),
  { $set: { resolved_position_name: joinPositionNamesExpr('$positions') } },
  { $limit: 1 },
  {
    $lookup: {
      from: 'cln_company_lists',
      let: { company_type: '$company_type', company_row_id: '$company_row_id' },
      as: 'info_company',
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: [1, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
        { $project: { _id: 1, company_name: 1 } },
      ],
    },
  },
  { $unwind: { path: '$info_company', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: 'cln_company_manual_retrievals',
      let: { company_type: '$company_type', company_row_id: '$company_row_id' },
      as: 'info_manual_company',
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: [2, '$$company_type'] }, { $eq: ['$_id', '$$company_row_id'] }] } } },
        { $project: { _id: 1, company_name: 1 } },
      ],
    },
  },
  { $unwind: { path: '$info_manual_company', preserveNullAndEmptyArrays: true } },
  {
    $project: {
      position_name: '$resolved_position_name',
      positions: 1,
      company_name: { $cond: { if: '$info_company.company_name', then: '$info_company.company_name', else: '$info_manual_company.company_name' } },
    },
  },
]

// Added 2026-09-15 (UX audit follow-up): every sibling professionals list pipeline already
// resolves `sub_admin_row_id` to a display name via this exact lookup - Claim Requests was the
// last one still forcing the frontend to show a raw numeric id (or nothing at all, since it
// wasn't even surfaced as a column).
const SUB_ADMIN_NAME_LOOKUP: object[] = [
  { $lookup: { from: 'cln_sub_admins', localField: 'sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info' } },
  { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
]

export function buildPendingListPipeline(matchQuery: object[]): object[] {
  return [
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info' } },
    { $set: { user_name: '$user_info.user_name', full_name: '$user_info.full_name', email_id: '$user_info.email_id', sub_admin_row_id: '$user_info.sub_admin_row_id' } },
    { $match: { $and: matchQuery } },
    { $lookup: { from: 'cln_professionals_work_experiences', localField: 'user_row_id', foreignField: 'user_row_id', pipeline: PENDING_INFO_WORK_PIPELINE, as: 'info_work' } },
    { $unwind: { path: '$info_work', preserveNullAndEmptyArrays: true } },
    ...SUB_ADMIN_NAME_LOOKUP,
    {
      $project: {
        _id: 1, user_row_id: 1, claim_email_id: 1, claim_request_status: 1, date_n_time: 1,
        user_name: '$user_info.user_name', sub_admin_row_id: '$user_info.sub_admin_row_id',
        sub_admin_name: '$sub_admin_info.full_name',
        login_status: '$user_info.login_status', approval_status: '$user_info.approval_status',
        full_name: '$user_info.full_name', existing_email_id: '$user_info.email_id',
        position_name: '$info_work.position_name', positions: '$info_work.positions', company_name: '$info_work.company_name',
      },
    },
  ]
}

export function buildPendingCountPipeline(matchQuery: object[]): object[] {
  return [
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info' } },
    { $set: { user_name: '$user_info.user_name', full_name: '$user_info.full_name', email_id: '$user_info.email_id' } },
    { $match: { $and: matchQuery } },
    { $count: 'count' },
  ]
}

export function buildPendingMatchQuery(search?: string): object[] {
  const query: object[] = [{ claim_request_status: 1 }]
  if (search) query.push(buildSearchOr(search))
  return query
}

function buildReviewedListPipeline(claimRequestStatus: number, userInfoMatch: object, projectFields: Record<string, unknown>): object[] {
  return [
    { $sort: { _id: -1 } },
    { $match: { claim_request_status: claimRequestStatus } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $match: { user_info: { $elemMatch: userInfoMatch } } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_sub_admins', localField: 'user_info.sub_admin_row_id', foreignField: '_id', as: 'sub_admin_info' } },
    { $unwind: { path: '$sub_admin_info', preserveNullAndEmptyArrays: true } },
    { $project: projectFields },
  ]
}

function buildReviewedCountPipeline(claimRequestStatus: number, userInfoMatch: object): object[] {
  return [
    { $sort: { _id: -1 } },
    { $match: { claim_request_status: claimRequestStatus } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $match: { user_info: { $elemMatch: userInfoMatch } } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $count: 'count' },
  ]
}

const APPROVED_PROJECT = {
  _id: 1, user_row_id: 1, claim_request_status: 1, date_n_time: 1,
  user_name: '$user_info.user_name', sub_admin_row_id: '$user_info.sub_admin_row_id',
  sub_admin_name: '$sub_admin_info.full_name',
  login_status: '$user_info.login_status', approval_status: '$user_info.approval_status',
  full_name: '$user_info.full_name', email_id: '$user_info.email_id',
}

const REJECTED_PROJECT = {
  _id: 1, user_row_id: 1, claim_email_id: 1, claim_request_status: 1, claim_rejected_reason: 1, date_n_time: 1,
  user_name: '$user_info.user_name', sub_admin_row_id: '$user_info.sub_admin_row_id',
  sub_admin_name: '$sub_admin_info.full_name',
  login_status: '$user_info.login_status', approval_status: '$user_info.approval_status',
  full_name: '$user_info.full_name', existing_email_id: '$user_info.email_id',
}

export function buildApprovedListPipeline(search?: string): object[] {
  return buildReviewedListPipeline(2, search ? buildSearchOr(search) : {}, APPROVED_PROJECT)
}
export function buildApprovedCountPipeline(search?: string): object[] {
  return buildReviewedCountPipeline(2, search ? buildSearchOr(search) : {})
}
export function buildRejectedListPipeline(search?: string): object[] {
  return buildReviewedListPipeline(3, search ? buildSearchOr(search) : {}, REJECTED_PROJECT)
}
export function buildRejectedCountPipeline(search?: string): object[] {
  return buildReviewedCountPipeline(3, search ? buildSearchOr(search) : {})
}

export function buildViewClaimPipeline(requestRowId: number): object[] {
  return [
    { $match: { _id: requestRowId } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, user_row_id: 1, claim_email_id: 1, claim_request_status: 1, date_n_time: 1, claim_rejected_reason: 1,
        user_name: '$user_info.user_name', full_name: '$user_info.full_name', existing_email_id: '$user_info.email_id',
      },
    },
  ]
}
