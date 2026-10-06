// modules/community-posts/community-posts.feed.list.queries.ts
// Ports services/main/community/posts.ts's getPostsList (~line 5-355) - the list-specific pieces
// (match stage, final projection, pipeline assembly). Shared enrichment stages live in
// community-posts.feed.queries.ts.
//
// CONFIRMED PRE-EXISTING BUG, fixed here (same class already fixed for community-admin's
// deleted_list in this migration): legacy runs `$skip`/`$limit` BEFORE the user-name lookups the
// search filter depends on, then applies the search `$match` to that already-paginated slice - a
// search can come back with fewer results than actually exist, or miss matches entirely, since
// filtering only ever sees one page's worth of candidates. Legacy's separate
// `total_posts = countDocuments(matchStage)` also ignores the search term entirely for the same
// reason (it can't see the lookup-derived name fields). Fixed with the standard pattern from this
// migration: do the lookups + search match first, then `$facet` into a sorted/paginated `data`
// branch and a `totalCount` branch that both see the same filtered set.
// Untyped require (not the typed default import) matching community-admin.posts.service.ts's own
// precedent: Mongoose's typed `.aggregate()` overload demands a strict `PipelineStage[]`, which
// this dynamically-shaped pipeline (built from plain objects, like every other aggregation
// pipeline in this migration) can't satisfy without an unnecessary cast.
const CommunityPostsM = require('../../../models/main/community/community_postsM')
import { userLookupStage, buildPostEnrichmentTailStages, buildFeedSearchMatch } from './community-posts.feed.queries'

export const FEED_PROJECTION = {
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
  user_following_status: 1,
}

export function buildPostsListMatchStage(params: { startDate?: string; endDate?: string; groupId?: number }) {
  const matchStage: Record<string, unknown> = { post_status: true }
  const start = params.startDate ? new Date(params.startDate) : null
  const end = params.endDate ? new Date(params.endDate) : null
  if (start && end) matchStage.date = { $gte: start, $lte: end }
  else if (start) matchStage.date = { $gte: start }
  else if (end) matchStage.date = { $lte: end }
  if (params.groupId !== undefined && !Number.isNaN(params.groupId)) matchStage.group_id = params.groupId
  return matchStage
}

export function buildPostsListPipeline(params: { matchStage: Record<string, unknown>; search?: string; skip: number; limit: number; userRowId: number | string }) {
  const { matchStage, search, skip, limit, userRowId } = params
  return [
    { $match: matchStage },
    userLookupStage('user_row_id', 'user_info'),
    { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
    userLookupStage('repost_user_row_id', 'repost_user_info'),
    { $unwind: { path: '$repost_user_info', preserveNullAndEmptyArrays: true } },
    ...buildFeedSearchMatch(search),
    {
      $facet: {
        data: [
          { $addFields: { sortDate: { $cond: { if: '$is_repost', then: '$reposted_date', else: '$date' } } } },
          { $sort: { sortDate: -1 } },
          { $skip: skip },
          { $limit: limit },
          ...buildPostEnrichmentTailStages(userRowId),
          { $project: FEED_PROJECTION },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractPostsListResult(aggregateOutput: { data: Record<string, unknown>[]; totalCount: { count: number }[] }[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, count: facetResult.totalCount[0]?.count ?? 0 }
}

export async function runPostsListAggregate(pipeline: Record<string, unknown>[]) {
  return CommunityPostsM.aggregate(pipeline)
}
