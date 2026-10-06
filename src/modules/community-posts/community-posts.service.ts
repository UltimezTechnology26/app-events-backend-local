// modules/community-posts/community-posts.service.ts
// Ports services/main/community/posts.ts's getLeaderboard (~line 357-450) verbatim, plus a
// CONFIRMED PERF FIX: legacy fetches the top-8 users, their profile images, the current user's
// own profile, and their own profile image as four independent sequential `await`s - Promise.all'd
// here instead, since none of the four depend on each other's result (same standard fix applied
// everywhere else in this migration).
import {
  LEADERBOARD_LIMIT,
  getLeaderboardRanking,
  findLeaderboardUsers,
  findLeaderboardProfileImages,
  findLeaderboardUser,
  findLeaderboardProfileImage,
} from './community-posts.queries'

interface LeaderboardEntry {
  rank: number
  name: string
  pro_batch: boolean
  image_url: string
  user_name: string
  total_posts: number
  login_status?: number
  approval_status?: number
}

export async function getLeaderboard(userRowId?: number) {
  const leaderboard = await getLeaderboardRanking()
  const userIds = leaderboard.map((item) => item._id)

  const rankMap: Record<number, number> = {}
  userIds.forEach((id, index) => {
    rankMap[id] = index + 1
  })

  const topUserIds = userIds.slice(0, LEADERBOARD_LIMIT)

  const [usersList, images, ownUser, ownImage] = await Promise.all([
    findLeaderboardUsers(topUserIds),
    findLeaderboardProfileImages(topUserIds),
    userRowId ? findLeaderboardUser(userRowId) : Promise.resolve(null),
    userRowId ? findLeaderboardProfileImage(userRowId) : Promise.resolve(null),
  ])

  const topUsers: LeaderboardEntry[] = topUserIds.map((id) => {
    const user = usersList.find((u) => u._id === id)
    const img = images.find((i) => i.user_row_id === id)
    const postData = leaderboard.find((p) => p._id === id)
    return {
      rank: rankMap[id],
      name: user?.full_name || 'Unknown',
      pro_batch: user?.pro_batch || false,
      image_url: img?.profile_image || '',
      user_name: user?.user_name || '',
      total_posts: postData?.total_posts ?? 0,
      login_status: user?.login_status,
      approval_status: user?.approval_status,
    }
  })

  let yourRank: LeaderboardEntry | null = null
  if (userRowId) {
    const totalPosts = rankMap[userRowId] ? leaderboard.find((p) => p._id === userRowId)?.total_posts || 0 : 0
    yourRank = {
      rank: rankMap[userRowId] || userIds.length + 1,
      name: ownUser?.full_name || 'Unknown',
      pro_batch: ownUser?.pro_batch || false,
      user_name: ownUser?.user_name || '',
      image_url: ownImage?.profile_image || '',
      total_posts: totalPosts,
      login_status: ownUser?.login_status,
      approval_status: ownUser?.approval_status,
    }
  }

  return { status: true, message: 'Leaderboard fetched', leaders: topUsers, your_rank: yourRank }
}
