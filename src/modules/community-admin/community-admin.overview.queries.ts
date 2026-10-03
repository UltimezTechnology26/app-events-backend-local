// modules/community-admin/community-admin.overview.queries.ts
// Ports overview.js's GET /details (~line 9-387) pipeline-building logic.
import { CommunityOverviewDateRange } from './community-admin.overview.types'

/** Ports getDateRangeFilter (~line 9-27) verbatim. */
export function buildOverviewDateRangeFilter(rangeType: string | undefined): Record<string, unknown> | null {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (rangeType as CommunityOverviewDateRange) {
    case 'today':
      return { $gte: startOfToday }
    case '7days':
      return { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7) }
    case '1month':
      return { $gte: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()) }
    case '3months':
      return { $gte: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()) }
    case '6months':
      return { $gte: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()) }
    default:
      return null
  }
}

/**
 * The lookup chain shared verbatim by all three "top posts" pipelines below (liked/commented/
 * reposted) - legacy repeated this same block 3 times; extracted once here instead
 * (CLAUDE.md: no code block duplicated across services once it repeats).
 */
function buildTopPostEnrichmentStages(extraProjectFields: Record<string, unknown>) {
  return [
    {
      $lookup: {
        from: 'cln_main_community_posts',
        let: { postId: '$_id' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$_id', '$$postId'] }, { $eq: ['$post_status', true] }] } } }],
        as: 'post',
      },
    },
    { $unwind: '$post' },
    { $limit: 5 },
    { $lookup: { from: 'cln_professionals', localField: 'post.user_row_id', foreignField: '_id', as: 'user_info' } },
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals', localField: 'post.repost_user_row_id', foreignField: '_id', as: 'repost_user_info' } },
    { $unwind: { path: '$repost_user_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'post.user_row_id', foreignField: 'user_row_id', as: 'profile_info' } },
    { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_professionals_profile_images', localField: 'post.repost_user_row_id', foreignField: 'user_row_id', as: 'repost_user_profile' } },
    { $unwind: { path: '$repost_user_profile', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_main_community_groups', localField: 'post.group_id', foreignField: '_id', as: 'group_details' } },
    { $unwind: { path: '$group_details', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: '$post._id',
        post_content: '$post.content',
        post_images: '$post.images',
        full_name: '$user_info.full_name',
        user_name: '$user_info.user_name',
        user_pro_batch: '$user_info.pro_batch',
        user_email: '$user_info.email',
        user_profile_image: '$profile_info.profile_image',
        repost_full_name: '$repost_user_info.full_name',
        repost_user_name: '$repost_user_info.user_name',
        repost_pro_batch: '$repost_user_info.pro_batch',
        repost_user_email: '$repost_user_info.email',
        repost_user_profile_image: '$repost_user_profile.profile_image',
        group_name: '$group_details.name',
        group_hastag: '$group_details.hashtag',
        date: '$post.date',
        reposted_date: '$post.reposted_date',
        is_repost: '$post.is_repost',
        repost_id: '$user_info.repost_id',
        ...extraProjectFields,
      },
    },
  ]
}

/** Runs against `community_likesM`. */
export function buildTopLikedPostsPipeline(dateFilter: Record<string, unknown> | null) {
  const matchCondition = { ...(dateFilter ? { date: dateFilter } : {}), like_status: 1 }
  return [{ $match: matchCondition }, { $group: { _id: '$post_id', likeCount: { $sum: 1 } } }, { $sort: { likeCount: -1 } }, ...buildTopPostEnrichmentStages({ likeCount: 1 })]
}

/** Runs against `community_commentsM`. */
export function buildTopCommentedPostsPipeline(dateFilter: Record<string, unknown> | null) {
  const matchCondition = { ...(dateFilter ? { date: dateFilter } : {}), parent_comment_id: null }
  return [{ $match: matchCondition }, { $group: { _id: '$post_id', commentCount: { $sum: 1 } } }, { $sort: { commentCount: -1 } }, ...buildTopPostEnrichmentStages({ commentCount: 1 })]
}

/** Runs against `community_postsM`. */
export function buildTopRepostedPostsPipeline(dateFilter: Record<string, unknown> | null) {
  const matchCondition = { ...(dateFilter ? { date: dateFilter } : {}), is_repost: true, post_status: true, repost_id: { $ne: null } }
  return [{ $match: matchCondition }, { $group: { _id: '$repost_id', repostCount: { $sum: 1 } } }, { $sort: { repostCount: -1 } }, ...buildTopPostEnrichmentStages({ repostCount: 1 })]
}

/** Ports getConditionalPostCount (~line 389-428) verbatim - runs against `community_postsM`. */
export function buildConditionalPostCountPipeline(start: Date, end: Date, groupId: number) {
  return [
    {
      $match: {
        group_id: groupId,
        post_status: true,
        $expr: {
          $and: [
            { $gte: [{ $cond: { if: '$is_repost', then: '$reposted_date', else: '$date' } }, start] },
            { $lt: [{ $cond: { if: '$is_repost', then: '$reposted_date', else: '$date' } }, end] },
          ],
        },
      },
    },
    { $count: 'count' },
  ]
}
