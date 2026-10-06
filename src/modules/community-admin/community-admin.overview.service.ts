// modules/community-admin/community-admin.overview.service.ts
// Ports overview.js's GET /details and GET /group_details/:group_id (~line 1-558).
//
// `community_postsM`/`community_commentsM`/`community_likesM` are NOT colocated here - same
// "generic/shared, required directly" precedent already used by community-admin.posts.service.ts.
const community_postsM = require('../../../models/main/community/community_postsM')
const community_commentsM = require('../../../models/main/community/community_commentsM')
const community_likesM = require('../../../models/main/community/community_likesM')
import {
  buildOverviewDateRangeFilter,
  buildTopLikedPostsPipeline,
  buildTopCommentedPostsPipeline,
  buildTopRepostedPostsPipeline,
  buildConditionalPostCountPipeline,
} from './community-admin.overview.queries'
import { CommunityOverviewDetails, CommunityGroupOverviewDetails } from './community-admin.overview.types'

/** Ports GET /details (~line 29-387) verbatim. */
export async function getOverviewDetails(dateRangeRaw: string | undefined): Promise<{ status: true; message: CommunityOverviewDetails }> {
  const dateFilter = buildOverviewDateRangeFilter(dateRangeRaw)

  const [totalPosts, totalDeletedPosts, topLikedPosts, topCommentedPosts, topRepostedPosts] = await Promise.all([
    community_postsM.countDocuments({ post_status: true }),
    community_postsM.countDocuments({ post_status: false }),
    community_likesM.aggregate(buildTopLikedPostsPipeline(dateFilter)),
    community_commentsM.aggregate(buildTopCommentedPostsPipeline(dateFilter)),
    community_postsM.aggregate(buildTopRepostedPostsPipeline(dateFilter)),
  ])

  return {
    status: true,
    message: {
      total_posts: totalPosts,
      total_deleted_posts: totalDeletedPosts,
      top_liked_posts: topLikedPosts,
      top_commented_posts: topCommentedPosts,
      top_reposted_posts: topRepostedPosts,
    },
  }
}

function getDayBoundaries() {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(todayStart.getDate() + 1)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(todayStart.getDate() - 1)
  return { todayStart, tomorrowStart, yesterdayStart }
}

function getPercentageChange(today: number, yesterday: number): number {
  if (yesterday === 0) return today > 0 ? 100 : 0
  return Math.round(((today - yesterday) / yesterday) * 100 * 100) / 100
}

async function getTodayVsYesterdayCounts(allPostIds: number[], groupId: number) {
  const { todayStart, tomorrowStart, yesterdayStart } = getDayBoundaries()

  const [todayLike, yesterdayLike, todayDislike, yesterdayDislike, todayComment, yesterdayComment, todayRepost, yesterdayRepost, todayPost, yesterdayPost] = await Promise.all([
    community_likesM.countDocuments({ post_id: { $in: allPostIds }, like_status: 1, date_n_time: { $gte: todayStart, $lt: tomorrowStart } }),
    community_likesM.countDocuments({ post_id: { $in: allPostIds }, like_status: 1, date_n_time: { $gte: yesterdayStart, $lt: todayStart } }),
    community_likesM.countDocuments({ post_id: { $in: allPostIds }, like_status: 2, date_n_time: { $gte: todayStart, $lt: tomorrowStart } }),
    community_likesM.countDocuments({ post_id: { $in: allPostIds }, like_status: 2, date_n_time: { $gte: yesterdayStart, $lt: todayStart } }),
    community_commentsM.countDocuments({ post_id: { $in: allPostIds }, date: { $gte: todayStart, $lt: tomorrowStart } }),
    community_commentsM.countDocuments({ post_id: { $in: allPostIds }, date: { $gte: yesterdayStart, $lt: todayStart } }),
    community_postsM.countDocuments({ group_id: groupId, is_repost: true, post_status: true, reposted_date: { $gte: todayStart, $lt: tomorrowStart } }),
    community_postsM.countDocuments({ group_id: groupId, is_repost: true, post_status: true, reposted_date: { $gte: yesterdayStart, $lt: todayStart } }),
    community_postsM.aggregate(buildConditionalPostCountPipeline(todayStart, tomorrowStart, groupId)),
    community_postsM.aggregate(buildConditionalPostCountPipeline(yesterdayStart, todayStart, groupId)),
  ])

  return {
    like_change_percentage: getPercentageChange(todayLike, yesterdayLike),
    dislike_change_percentage: getPercentageChange(todayDislike, yesterdayDislike),
    comment_change_percentage: getPercentageChange(todayComment, yesterdayComment),
    repost_change_percentage: getPercentageChange(todayRepost, yesterdayRepost),
    post_change_percentage: getPercentageChange(todayPost[0]?.count || 0, yesterdayPost[0]?.count || 0),
  }
}

/** Ports GET /group_details/:group_id (~line 430-558) verbatim. */
export async function getGroupOverviewDetails(groupIdRaw: string): Promise<{ status: true; message: CommunityGroupOverviewDetails } | { status: false; message: string }> {
  const groupId = Number.parseInt(groupIdRaw)
  if (Number.isNaN(groupId)) {
    return { status: false, message: 'Invalid group id.' }
  }

  const posts = await community_postsM.find({ group_id: groupId, post_status: true }, { _id: 1, is_repost: 1 }).lean()
  const allPostIds = posts.map((post: { _id: number }) => post._id)

  const [totalComments, totalLikes, totalDislikes, totalReposts] = await Promise.all([
    community_commentsM.countDocuments({ post_id: { $in: allPostIds } }),
    community_likesM.countDocuments({ post_id: { $in: allPostIds }, like_status: 1 }),
    community_likesM.countDocuments({ post_id: { $in: allPostIds }, like_status: 2 }),
    community_postsM.countDocuments({ repost_id: { $in: allPostIds }, is_repost: true, post_status: true }),
  ])

  const changePercentages = await getTodayVsYesterdayCounts(allPostIds, groupId)

  return {
    status: true,
    message: {
      total_group_posts: allPostIds.length,
      total_comments: totalComments,
      total_likes: totalLikes,
      total_dislikes: totalDislikes,
      total_reposts: totalReposts,
      ...changePercentages,
    },
  }
}
