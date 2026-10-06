// modules/community-posts/community-posts.user-posts.queries.ts
// Ports controllers/main/community/posts.js's GET /get_user_posts/:skip/:limit (~line 437-685).
// Reuses the shared enrichment stages from community-posts.feed.queries.ts - legacy's own lookups
// here fetch unprojected professional documents (no sub-pipeline projection, unlike get_posts/
// get_single_post), but the final $project below narrows to the same fields either way, so reusing
// the narrower lookup is a pure perf win with no observable difference.
const CommunityPostsM = require('../../../models/main/community/community_postsM')
import { userLookupStage, buildPostEnrichmentTailStages } from './community-posts.feed.queries'

const USER_POSTS_PROJECTION = {
  _id: 1,
  content: 1,
  group: { hastag: '$group_details.hashtag', id: '$group_details._id', name: '$group_details.name' },
  user_details: {
    _id: '$user_info._id',
    name: '$user_info.full_name',
    pro_batch: '$user_info.pro_batch',
    user_name: '$user_info.user_name',
    image: '$profile_info.profile_image',
    login_status: '$user_info.login_status',
    approval_status: '$user_info.approval_status',
  },
  repost_user_details: {
    _id: '$repost_user_info._id',
    name: '$repost_user_info.full_name',
    pro_batch: '$repost_user_info.pro_batch',
    user_name: '$repost_user_info.user_name',
    image: '$repost_user_profile.profile_image',
    login_status: '$repost_user_info.login_status',
    approval_status: '$repost_user_info.approval_status',
  },
  date: 1,
  image: 1,
  repost_count: 1,
  repost_comment: 1,
  is_repost: 1,
  createdAt: 1,
  updatedAt: 1,
  like_count: 1,
  dislike_count: 1,
  user_like_status: 1,
  comment_count: 1,
  repost_id: 1,
  reposted_date: 1,
  post_status: 1,
}

/** Ports the exprCondition/matchStage build (~line 451-465) verbatim. */
export function buildUserPostsMatchStage(userRowId: number, groupId: number | null) {
  const exprCondition = { $cond: [{ $eq: ['$is_repost', true] }, { $eq: ['$repost_user_row_id', userRowId] }, { $eq: ['$user_row_id', userRowId] }] }
  return { $and: [{ $expr: exprCondition }, { post_status: true }, ...(groupId ? [{ group_id: groupId }] : [])] }
}

export function buildUserPostsPipeline(matchStage: Record<string, unknown>, skip: number, limit: number, userRowId: number) {
  return [
    { $match: matchStage },
    { $addFields: { sortDate: { $cond: { if: '$is_repost', then: '$reposted_date', else: '$date' } } } },
    { $sort: { sortDate: -1 } },
    { $skip: skip },
    { $limit: limit },
    userLookupStage('user_row_id', 'user_info'),
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    userLookupStage('repost_user_row_id', 'repost_user_info'),
    { $unwind: { path: '$repost_user_info', preserveNullAndEmptyArrays: true } },
    ...buildPostEnrichmentTailStages(userRowId),
    { $project: USER_POSTS_PROJECTION },
  ]
}

export async function runUserPostsAggregate(pipeline: Record<string, unknown>[]) {
  return CommunityPostsM.aggregate(pipeline)
}

/**
 * Unlike get_posts, this match stage has no lookup-dependent search filter - it only ever matches
 * raw fields already on the document - so counting against it directly (as legacy already does)
 * is correct as-is, no $facet restructuring needed here.
 */
export async function countUserPosts(matchStage: Record<string, unknown>) {
  const result = await CommunityPostsM.aggregate([{ $match: matchStage }, { $count: 'totalCount' }])
  return result[0]?.totalCount ?? 0
}
