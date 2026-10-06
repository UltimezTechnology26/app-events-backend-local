// modules/benefits/benefits.queries.ts
// Ported 1:1 from services/main/benefits.ts (~65-187) - the queries not already covered by the
// community module's own community.queries.ts (getProfileScores/
// getPostDates are reused from there instead of being redeclared here).
import CommunityPostsM from '../../../models/main/community/community_postsM'
import ProfessionalsPointsM from '../../../models/app/users/professionals_pointsM'
import CoursesCertificatesM from '../../../models/main/academy/courses_certificatesM'

const LEADERBOARD_LIMIT = 1000

/** Same ranking source `getLeaderboardRanking` i.e. all-time post counts per user, capped at 1000. */
export async function getLeaderboardRanking(): Promise<{ _id: number; total_posts: number }[]> {
  return CommunityPostsM.aggregate([
    { $match: { post_status: true } },
    { $group: { _id: '$user_row_id', total_posts: { $sum: 1 } } },
    { $sort: { total_posts: -1 } },
    { $limit: LEADERBOARD_LIMIT },
  ])
}

/**
 * FIXED (2026-10-03, explicit sign-off): legacy compared the `.exists()` call's return value - a
 * Promise - against `null` without awaiting it first, so this was always `true` regardless of
 * whether the user actually held an academy certificate. Now correctly awaits before comparing.
 */
export async function hasAcademyCertificate(userRowId: number): Promise<boolean> {
  return (await CoursesCertificatesM.exists({ user_row_id: userRowId })) !== null
}

export async function hasPointType(userRowId: number, pointType: string): Promise<boolean> {
  return Boolean(await ProfessionalsPointsM.exists({ user_row_id: userRowId, point_type: pointType }))
}

export async function getPointsBalance(userRowId: number): Promise<number> {
  const result = await ProfessionalsPointsM.aggregate([
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
  return result[0]?.total_balance || 0
}
