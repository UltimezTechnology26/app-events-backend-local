// modules/community-posts/community-posts.feed.queries.ts
// Shared enrichment-pipeline primitives, ported from services/main/community/posts.ts's identical
// lookup chain in both getPostsList (~line 46-300) and getSinglePostDetails (~line 465-863).
// Reused by community-posts.feed.list.queries.ts (GET /get_posts) and
// community-posts.single-post.queries.ts (GET /get_single_post).
export const PROFESSIONAL_PROJECTION = {
  _id: 1,
  full_name: 1,
  user_name: 1,
  pro_batch: 1,
  email_id: 1,
  mobile_number: 1,
  country_mobile_id: 1,
  login_status: 1,
  approval_status: 1,
}

export function userLookupStage(localField: string, as: string) {
  return { $lookup: { from: 'cln_professionals', localField, foreignField: '_id', as, pipeline: [{ $project: PROFESSIONAL_PROJECTION }] } }
}

export function profileImageLookupStage(localField: string, as: string) {
  return {
    $lookup: { from: 'cln_professionals_profile_images', localField, foreignField: 'user_row_id', as, pipeline: [{ $project: { user_row_id: 1, profile_image: 1 } }] },
  }
}

/**
 * Every enrichment stage after the user/repost-user lookups (those two run separately beforehand,
 * since the search match - list pipeline only - depends on them but nothing else here does).
 * Ported from legacy's own stage order (~line 94-300 / 516-863), same for both list and single-post.
 */
export function buildPostEnrichmentTailStages(userRowId: number | string) {
  return [
    { $lookup: { from: 'cln_main_community_groups', localField: 'group_id', foreignField: '_id', as: 'group_details', pipeline: [{ $project: { _id: 1, name: 1, hashtag: 1 } }] } },
    { $unwind: { path: '$group_details', preserveNullAndEmptyArrays: true } },
    profileImageLookupStage('user_row_id', 'profile_info'),
    { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
    profileImageLookupStage('repost_user_row_id', 'repost_user_profile'),
    { $unwind: { path: '$repost_user_profile', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'cln_main_community_posts', localField: '_id', foreignField: 'repost_id', as: 'reposts', pipeline: [{ $project: { _id: 1 } }] } },
    { $addFields: { repost_count: { $size: '$reposts' } } },
    { $lookup: { from: 'cln_main_community_user_likes', localField: '_id', foreignField: 'post_id', as: 'likes_data', pipeline: [{ $project: { user_row_id: 1, like_status: 1 } }] } },
    {
      $addFields: {
        like_count: { $size: { $filter: { input: '$likes_data', as: 'item', cond: { $eq: ['$$item.like_status', 1] } } } },
        dislike_count: { $size: { $filter: { input: '$likes_data', as: 'item', cond: { $eq: ['$$item.like_status', 2] } } } },
        user_like_status: {
          $let: {
            vars: { matched: { $filter: { input: '$likes_data', as: 'item', cond: { $eq: ['$$item.user_row_id', userRowId] } } } },
            in: { $cond: { if: { $gt: [{ $size: '$$matched' }, 0] }, then: { $arrayElemAt: ['$$matched.like_status', 0] }, else: 0 } },
          },
        },
      },
    },
    {
      $lookup: {
        from: 'cln_main_community_post_comments',
        let: { postId: '$_id' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$post_id', '$$postId'] }, { $eq: ['$parent_comment_id', null] }] } } }, { $count: 'count' }],
        as: 'commentCount',
      },
    },
    {
      $lookup: {
        from: 'cln_professionals_followers',
        let: { targetUserId: { $cond: { if: '$is_repost', then: '$repost_user_info._id', else: '$user_info._id' } }, currentUserId: userRowId },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$following_user_row_id', '$$targetUserId'] }, { $eq: ['$follower_user_row_id', '$$currentUserId'] }] } } },
          { $project: { confirm_request_status: 1, _id: 0 } },
        ],
        as: 'follow_status',
      },
    },
    {
      $addFields: {
        comment_count: { $cond: { if: { $gt: [{ $size: '$commentCount' }, 0] }, then: { $arrayElemAt: ['$commentCount.count', 0] }, else: 0 } },
        user_following_status: { $cond: { if: { $gt: [{ $size: '$follow_status' }, 0] }, then: { $arrayElemAt: ['$follow_status.confirm_request_status', 0] }, else: 0 } },
      },
    },
  ]
}

export function buildFeedSearchMatch(search: string | undefined) {
  return search
    ? [{ $match: { $or: [{ 'repost_user_info.full_name': { $regex: search, $options: 'i' } }, { 'user_info.full_name': { $regex: search, $options: 'i' } }] } }]
    : []
}
