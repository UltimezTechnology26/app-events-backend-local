// modules/professionals-points/professionals-points.service.ts
// Ports controllers/app/users/points.js's GET /list/:skip/:limit — the self-service "my points
// balance" view (distinct from professionals-audit's admin-side points_list). Legacy's own file
// already carries a confirmed bug fix from a prior engagement (total_entries counting the
// unpaginated match set via a $facet total_count branch, not the paginated page length) — ported
// as-is, no further changes needed. `professionalsM` was required but never used in legacy; not
// carried into this port (dead import).
// professionals_pointsM is shared with several still-live legacy files (admin_panel/app/user.js,
// setting.js, pro_batch.js, etc.) — required directly, not colocated, matching the same model's
// treatment in professionals-audit.service.ts.
const ProfessionalsPointsM = require('../../../models/app/users/professionals_pointsM')

export interface UserTokenAuthFailure {
  status: false
  message: string
}
export interface UserTokenAuthSuccess {
  status: true
  message: number
}
export type UserTokenAuthResult = UserTokenAuthSuccess | UserTokenAuthFailure

export async function getPointsList(auth: UserTokenAuthResult, skipRaw: unknown, limitRaw: unknown, startDateRaw: unknown, endDateRaw: unknown) {
  if (!auth.status) return auth

  const skip = Number.isNaN(Number.parseInt(String(skipRaw))) ? 0 : Number.parseInt(String(skipRaw))
  const limit = Number.isNaN(Number.parseInt(String(limitRaw))) ? 100 : Number.parseInt(String(limitRaw))
  const userRowId = auth.message

  const matchQuery: Record<string, any> = { user_row_id: userRowId }
  if (startDateRaw || endDateRaw) {
    matchQuery.created_at = {}
    if (startDateRaw) matchQuery.created_at.$gte = new Date(`${startDateRaw}T00:00:00.000Z`)
    if (endDateRaw) matchQuery.created_at.$lte = new Date(`${endDateRaw}T23:59:59.999Z`)
  }

  const data = await ProfessionalsPointsM.aggregate([
    { $match: matchQuery },
    { $addFields: { numeric_points: { $toDouble: '$points' } } },
    {
      $facet: {
        all_points: [
          { $sort: { _id: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 1, point_type: 1, point_status: 1, points: 1, created_at: 1 } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              total_credited: { $sum: { $cond: [{ $eq: ['$point_status', 'credited'] }, '$numeric_points', 0] } },
              total_debited: { $sum: { $cond: [{ $eq: ['$point_status', 'debited'] }, '$numeric_points', 0] } },
            },
          },
          { $addFields: { total_balance: { $subtract: ['$total_credited', '$total_debited'] } } },
        ],
        total_count: [{ $count: 'count' }],
      },
    },
  ])

  const result = data[0]
  const totals = result.totals[0] || { total_credited: 0, total_debited: 0, total_balance: 0 }

  return {
    status: true,
    total_entries: result?.total_count?.[0]?.count || 0,
    ...totals,
    points: result.all_points,
  }
}
