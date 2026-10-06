// modules/community-posts/community-posts.single-post.queries.ts
// Ports services/main/community/posts.ts's getSinglePostDetails (~line 452-920) - the
// single-post-specific pieces (comments+replies lookup, final projection, pipeline assembly).
// Shared enrichment stages live in community-posts.feed.queries.ts. Unlike the list route, there's
// only ever one document here, so none of the list route's pagination/search-ordering fix applies
// - legacy's own stage order is used as-is.
const CommunityPostsM = require('../../../models/main/community/community_postsM')
import { userLookupStage, profileImageLookupStage, buildPostEnrichmentTailStages } from './community-posts.feed.queries'

const COMMENT_USER_PROJECTION = { _id: 1, full_name: 1, user_name: 1, pro_batch: 1, login_status: 1, approval_status: 1 }

const COMMENT_USER_SHAPE = {
  _id: '$user_info._id',
  name: '$user_info.full_name',
  user_name: '$user_info.user_name',
  pro_batch: '$user_info.pro_batch',
  image: '$profile_info.profile_image',
  login_status: '$user_info.login_status',
  approval_status: '$user_info.approval_status',
}

/** Ports the nested replies lookup inside the comments lookup (~line 667-732) verbatim. */
function buildRepliesLookupStage() {
  return {
    $lookup: {
      from: 'cln_main_community_post_comments',
      let: { parentId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$parent_comment_id', '$$parentId'] } } },
        { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $project: COMMENT_USER_PROJECTION }] } },
        { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
        profileImageLookupStage('user_row_id', 'profile_info'),
        { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, comment: 1, date: 1, user: COMMENT_USER_SHAPE } },
      ],
      as: 'replies',
    },
  }
}

/** Ports the top-level comments lookup, with nested replies (~line 650-793) verbatim. */
function buildCommentsLookupStage() {
  return {
    $lookup: {
      from: 'cln_main_community_post_comments',
      let: { postId: '$_id' },
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$post_id', '$$postId'] }, { $eq: ['$parent_comment_id', null] }] } } },
        { $sort: { date: -1 } },
        buildRepliesLookupStage(),
        { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info', pipeline: [{ $project: COMMENT_USER_PROJECTION }] } },
        { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
        profileImageLookupStage('user_row_id', 'profile_info'),
        { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, comment: 1, date: 1, user: COMMENT_USER_SHAPE, replies: 1 } },
      ],
      as: 'comments',
    },
  }
}

const SINGLE_POST_PROJECTION = {
  _id: 1,
  content: 1,
  group: { hastag: '$group_details.hashtag', id: '$group_details._id', name: '$group_details.name' },
  user_details: {
    _id: '$user_info._id',
    name: '$user_info.full_name',
    pro_batch: '$user_info.pro_batch',
    image: '$profile_info.profile_image',
    user_name: '$user_info.user_name',
    login_status: '$user_info.login_status',
    approval_status: '$user_info.approval_status',
  },
  repost_user_details: {
    _id: '$repost_user_info._id',
    name: '$repost_user_info.full_name',
    user_name: '$repost_user_info.user_name',
    pro_batch: '$repost_user_info.pro_batch',
    image: '$repost_user_profile.profile_image',
    login_status: '$repost_user_info.login_status',
    approval_status: '$repost_user_info.approval_status',
  },
  date: 1,
  image: 1,
  repost_comment: 1,
  is_repost: 1,
  createdAt: 1,
  updatedAt: 1,
  like_count: 1,
  dislike_count: 1,
  comments: 1,
  user_like_status: 1,
  repost_id: 1,
  repost_count: 1,
  comment_count: 1,
  reposted_date: 1,
  user_following_status: 1,
}

export async function findExistingPostId(postId: number) {
  return CommunityPostsM.findOne({ _id: postId, post_status: true }, { _id: 1 })
}

export function buildSinglePostPipeline(postId: number, userRowId: number) {
  return [
    { $match: { _id: postId } },
    userLookupStage('user_row_id', 'user_info'),
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    userLookupStage('repost_user_row_id', 'repost_user_info'),
    { $unwind: { path: '$repost_user_info', preserveNullAndEmptyArrays: true } },
    ...buildPostEnrichmentTailStages(userRowId),
    buildCommentsLookupStage(),
    { $project: SINGLE_POST_PROJECTION },
  ]
}

export async function runSinglePostAggregate(pipeline: Record<string, unknown>[]) {
  return CommunityPostsM.aggregate(pipeline)
}
