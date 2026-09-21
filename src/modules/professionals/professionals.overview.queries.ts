// modules/professionals/professionals.overview.queries.ts
//
// Ports the count-query building for user.js's GET /years_overview (~line 326-390) and
// GET /overview (~line 466-776). Query shapes are ported verbatim — no filter/field changes —
// this file just extracts the per-count Mongo query builders so the service layer can
// Promise.all them explicitly instead of the real routes' mix of Promise.all + sequential await.
import { ProfessionalM } from './professionals.models'
const professionals_delete_actionsM = require('../../../models/app/professionals_delete_actionsM')
const professionals_claimed_requestM = require('../../../models/app/professionals_claimed_requestM')
const professionals_manual_retrievalsM = require('../../../models/app/users/professionals_manual_retrievalsM')
const usersFollowersM = require('../../../models/app/professionals_followersM')

export function buildYearsOverviewCountQueries(yearRange: { start_date: string; end_date?: string }) {
  const dateFilter: Record<string, unknown> = yearRange.end_date ? { $gte: new Date(yearRange.start_date), $lte: new Date(yearRange.end_date) } : { $gte: new Date(yearRange.start_date) }
  return {
    total: ProfessionalM.countDocuments({ login_status: 1, created_date_n_time: dateFilter }),
    adminCreated: ProfessionalM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, created_date_n_time: dateFilter }),
  }
}

export const overviewCountQueries = {
  createdTotalPending: () => ProfessionalM.countDocuments({ login_status: 1, approval_status: 0 }),
  createdTotalApproved: () => ProfessionalM.countDocuments({ login_status: 1, approval_status: 1 }),
  createdTotalDisabled: () => ProfessionalM.countDocuments({ login_status: 0 }),
  createdTotalRejected: () => ProfessionalM.countDocuments({ login_status: 1, approval_status: 2 }),
  createdTotalDeleted: () => professionals_delete_actionsM.countDocuments({ action_type: 2 }),

  adminTotalPending: () => ProfessionalM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 0 }),
  adminTotalApproved: () => ProfessionalM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 1 }),
  adminTotalDisabled: () => ProfessionalM.countDocuments({ claim_status: { $gte: 1 }, login_status: 0 }),
  adminTotalRejected: () => ProfessionalM.countDocuments({ claim_status: { $gte: 1 }, login_status: 1, approval_status: 2 }),

  createdSubAdminTotalPending: () => ProfessionalM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 0 }),
  createdSubAdminTotalApproved: () => ProfessionalM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 1 }),
  createdSubAdminTotalDisabled: () => ProfessionalM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 0, approval_status: 1 }),
  createdSubAdminTotalRejected: () => ProfessionalM.countDocuments({ sub_admin_row_id: { $gte: 1 }, login_status: 1, approval_status: 2 }),

  totalPublic: () =>
    ProfessionalM.countDocuments({
      $and: [{ $or: [{ login_status: 1, approval_status: 0 }, { login_status: 1, approval_status: 1 }, { login_status: 0 }, { login_status: 1, approval_status: 2 }] }, { account_visible_type: 1 }],
    }),
  totalPrivate: () =>
    ProfessionalM.countDocuments({
      $and: [{ $or: [{ login_status: 1, approval_status: 0 }, { login_status: 1, approval_status: 1 }, { login_status: 0 }, { login_status: 1, approval_status: 2 }] }, { account_visible_type: 2 }],
    }),

  totalPendingManual: () => professionals_manual_retrievalsM.countDocuments({ approval_status: 0 }),
  totalApprovedManual: () => professionals_manual_retrievalsM.countDocuments({ approval_status: { $in: [1, 3] } }),
  totalRejectManual: () => professionals_manual_retrievalsM.countDocuments({ approval_status: 2 }),

  claimByStatusCount: (claimRequestStatus: number, dateFilter?: { $gte: Date; $lte?: Date }) => {
    const match: Record<string, unknown> = { claim_request_status: claimRequestStatus }
    if (dateFilter) match.date_n_time = dateFilter
    return professionals_claimed_requestM.countDocuments(match)
  },

  deleteRequestsPending: () => ProfessionalM.countDocuments({ login_status: 2 }),
  deleteRequestsRejected: () => professionals_delete_actionsM.countDocuments({ action_type: 2 }),

  totalCreatedUsers: () => ProfessionalM.countDocuments({ claim_status: { $gt: 0 } }),
  totalEnabledUsers: () => ProfessionalM.countDocuments({ login_status: 1 }),
  totalDisabledUsers: () => ProfessionalM.countDocuments({ login_status: 0 }),
}

/** Ported verbatim from /overview's claim_pending/claim_approved/claim_rejected aggregates. */
export function buildClaimRequestCountAggregate(claimRequestStatus: number) {
  return professionals_claimed_requestM.aggregate([
    { $sort: { _id: -1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info' } },
    { $match: { claim_request_status: claimRequestStatus } },
    { $count: 'count' },
  ])
}

/** Ported verbatim from /overview's delete_requests_approved aggregate. */
export function buildDeleteRequestsApprovedAggregate() {
  return professionals_delete_actionsM.aggregate([
    { $match: { action_type: 1 } },
    { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $project: { _id: 1 } }] } },
    { $unwind: { path: '$user_info' } },
    { $count: 'count' },
  ])
}

/** Ported verbatim from /overview's total_followers_count aggregate. */
export function buildTotalFollowersAggregate() {
  return usersFollowersM.aggregate([
    { $match: { confirm_request_status: 2 } },
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'following_user_row_id',
        foreignField: '_id',
        as: 'follower_user',
        pipeline: [{ $match: { login_status: 1, approval_status: 1 } }, { $project: { _id: 1 } }],
      },
    },
    { $unwind: '$follower_user' },
    { $group: { _id: '$following_user_row_id' } },
    { $count: 'count' },
  ])
}
