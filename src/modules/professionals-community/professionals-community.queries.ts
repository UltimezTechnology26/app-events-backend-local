// modules/professionals-community/professionals-community.queries.ts
// Ported 1:1 from controllers/main/community/pro_batch.js (~18-91, ~103-196). Same stages, same
// thresholds, same field names — no new behavior.
import ProfessionalM from '../../../models/app/professionalsM'
import CommunityPostsM from '../../../models/main/community/community_postsM'
import CommunityLikesM from '../../../models/main/community/community_likesM'
import CommunityCommentsM from '../../../models/main/community/community_commentsM'
import { EngagementStats } from './professionals-community.types'

const HIGH_ENGAGEMENT_LIKES_THRESHOLD = 500
const HIGH_ENGAGEMENT_COMMENTS_THRESHOLD = 300
const HIGH_ENGAGEMENT_REPOSTS_THRESHOLD = 100

export async function getProfileScores(userRowId: number) {
  return ProfessionalM.findOne(
    { _id: userRowId },
    {
      professional_profile_score: 1,
      seo_details_score: 1,
      social_media_score: 1,
      academy_score: 1,
      community_score: 1,
      professional_detail_score: 1,
      investment_score: 1,
      award_score: 1,
      faq_score: 1,
      profile_score: 1,
    },
  )
}

export async function getIntroAndFirstFeedFlags(userRowId: number) {
  return Promise.all([
    CommunityPostsM.exists({ user_row_id: userRowId, group_id: 1, post_status: true }),
    CommunityPostsM.exists({ user_row_id: userRowId, group_id: { $ne: 1 }, post_status: true }),
  ])
}

export async function getPostDates(userRowId: number) {
  return CommunityPostsM.aggregate([
    { $match: { user_row_id: userRowId, post_status: true } },
    { $project: { dateOnly: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } },
    { $group: { _id: '$dateOnly' } },
    { $sort: { _id: 1 } },
  ])
}

export async function getUserPostEngagementStats(userRowId: number): Promise<EngagementStats> {
  const userPosts = await CommunityPostsM.find(
    { post_status: true, $or: [{ user_row_id: userRowId }, { repost_user_row_id: userRowId }] },
    { _id: 1 },
  ).lean()

  const postIds = userPosts.map((p: any) => p._id)

  if (postIds.length === 0) {
    return { total_likes: 0, total_comments: 0, total_reposts: 0, high_engagement: false }
  }

  const [likeAgg, commentAgg, repostAgg] = await Promise.all([
    CommunityLikesM.aggregate([{ $match: { post_id: { $in: postIds }, like_status: 1 } }, { $count: 'total_likes' }]),
    CommunityCommentsM.aggregate([{ $match: { post_id: { $in: postIds }, parent_comment_id: null } }, { $count: 'total_comments' }]),
    CommunityPostsM.aggregate([{ $match: { is_repost: true, repost_id: { $in: postIds }, post_status: true } }, { $count: 'total_reposts' }]),
  ])

  const totalLikes = likeAgg[0]?.total_likes || 0
  const totalComments = commentAgg[0]?.total_comments || 0
  const totalReposts = repostAgg[0]?.total_reposts || 0

  const hasHighEngagement =
    totalLikes > HIGH_ENGAGEMENT_LIKES_THRESHOLD &&
    totalComments > HIGH_ENGAGEMENT_COMMENTS_THRESHOLD &&
    totalReposts > HIGH_ENGAGEMENT_REPOSTS_THRESHOLD

  return { total_likes: totalLikes, total_comments: totalComments, total_reposts: totalReposts, high_engagement: hasHighEngagement }
}

export async function getDistinctPostGroupIds(userRowId: number): Promise<number[]> {
  const groups = await CommunityPostsM.aggregate([
    { $match: { user_row_id: userRowId, post_status: true } },
    { $group: { _id: null, group_ids: { $addToSet: '$group_id' } } },
  ])
  return groups.length > 0 ? groups[0].group_ids : []
}
