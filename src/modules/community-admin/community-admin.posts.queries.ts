// modules/community-admin/community-admin.posts.queries.ts
//
// Ports posts.js's GET /deleted_list/:skip/:limit (~line 7-266) aggregation-building logic, and
// the equivalent shape backing the "All Posts" list (services/main/community/posts.ts's
// getPostsList, reused here for the admin's own list since the admin panel needs the same
// projection). Both share the same lookup chain, extracted once here rather than copy-pasted a
// third time (this exact ~150-line chain already appears 3x across posts.js/21dayschallenge.js -
// confirmed via direct reads, not assumed).

/** Shared date-range + group filter, applied on the raw (pre-lookup) fields - cheap, index-friendly. */
export function buildPostsBaseMatchQuery({ groupIdRaw, startDate, endDate, postStatus }: { groupIdRaw?: string; startDate?: string; endDate?: string; postStatus: boolean }): Record<string, unknown> {
  const match: Record<string, unknown> = { post_status: postStatus }

  const groupId = groupIdRaw ? Number.parseInt(groupIdRaw) : undefined
  if (groupId !== undefined && !Number.isNaN(groupId)) {
    match.group_id = groupId
  }

  const start = startDate ? new Date(startDate) : undefined
  const end = endDate ? new Date(endDate) : undefined
  if (start && end) {
    match.date = { $gte: start, $lte: end }
  } else if (start) {
    match.date = { $gte: start }
  } else if (end) {
    match.date = { $lte: end }
  }

  return match
}

const USER_LOOKUP_STAGES = [
  { $lookup: { from: 'cln_professionals', localField: 'user_row_id', foreignField: '_id', as: 'user_info' } },
  { $unwind: { path: '$user_info', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'cln_professionals', localField: 'repost_user_row_id', foreignField: '_id', as: 'repost_user_info' } },
  { $unwind: { path: '$repost_user_info', preserveNullAndEmptyArrays: true } },
]

/** `search` only ever depends on `user_info`/`repost_user_info` (never on the group/lookup-count fields further down the pipeline) - safe to apply this immediately after the 2 lookups it needs. */
function buildSearchStage(search?: string) {
  if (!search) return []
  return [
    {
      $match: {
        $or: [{ 'repost_user_info.full_name': { $regex: search, $options: 'i' } }, { 'user_info.full_name': { $regex: search, $options: 'i' } }],
      },
    },
  ]
}

const DISPLAY_LOOKUP_STAGES = [
  { $lookup: { from: 'cln_main_community_groups', localField: 'group_id', foreignField: '_id', as: 'group_details' } },
  { $unwind: { path: '$group_details', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'cln_professionals_profile_images', localField: 'user_row_id', foreignField: 'user_row_id', as: 'profile_info' } },
  { $unwind: { path: '$profile_info', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'cln_professionals_profile_images', localField: 'repost_user_row_id', foreignField: 'user_row_id', as: 'repost_user_profile' } },
  { $unwind: { path: '$repost_user_profile', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'cln_main_community_posts', localField: '_id', foreignField: 'repost_id', as: 'reposts' } },
  { $addFields: { repost_count: { $size: '$reposts' } } },
  { $lookup: { from: 'cln_main_community_user_likes', localField: '_id', foreignField: 'post_id', as: 'likes_data' } },
  {
    $addFields: {
      like_count: { $size: { $filter: { input: '$likes_data', as: 'item', cond: { $eq: ['$$item.like_status', 1] } } } },
      dislike_count: { $size: { $filter: { input: '$likes_data', as: 'item', cond: { $eq: ['$$item.like_status', 2] } } } },
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
  { $addFields: { comment_count: { $cond: { if: { $gt: [{ $size: '$commentCount' }, 0] }, then: { $arrayElemAt: ['$commentCount.count', 0] }, else: 0 } } } },
  {
    $project: {
      _id: 1,
      content: 1,
      group: { hashtag: '$group_details.hashtag', id: '$group_details._id', name: '$group_details.name' },
      user_details: { _id: '$user_info._id', name: '$user_info.full_name', user_name: '$user_info.user_name', pro_batch: '$user_info.pro_batch', image: '$profile_info.profile_image' },
      repost_user_details: { _id: '$repost_user_info._id', name: '$repost_user_info.full_name', user_name: '$repost_user_info.user_name', pro_batch: '$repost_user_info.pro_batch', image: '$repost_user_profile.profile_image' },
      date: 1,
      image: 1,
      repost_count: 1,
      repost_comment: 1,
      is_repost: 1,
      createdAt: 1,
      updatedAt: 1,
      like_count: 1,
      dislike_count: 1,
      // `user_like_status` deliberately not ported: legacy computed it from `checkToken.user_row_id`,
      // which `checkAdminLoginToken`'s return shape never sets (only `checkAllLoginToken`/self-service
      // tokens carry a user_row_id) - for every admin caller this always evaluated to the constant 0.
      // Confirmed by reading checkAdminLoginToken directly, not assumed.
      comment_count: 1,
      repost_id: 1,
      reposted_date: 1,
      post_status: 1,
    },
  },
]

/**
 * $facet-converted, search-order-fixed version of /deleted_list's (and the equivalent "All Posts")
 * pipeline.
 *
 * TWO CONFIRMED BUGS FIXED, not reproduced:
 * 1. CORRECTNESS BUG (not just perf): legacy applied `$skip`/`$limit` BEFORE the search $match -
 *    a search on page 1 was filtering an already-truncated page instead of the full matched set,
 *    so real matches later in the collection were silently invisible and a search could return
 *    fewer than `limit` results (or an empty page) even when plenty of matches existed. Moved the
 *    search $match to right after the two lookups it depends on (`user_info`/`repost_user_info`),
 *    before pagination - the same class of fix already applied to every other list this migration
 *    has touched, but here it's a correctness bug, not only a perf one.
 * 2. MISSING COUNT: legacy's `/deleted_list` never returned any count field at all, even though
 *    the frontend (`components/community/posts/deleted_post.js`) reads `res.data.countQueryRun`
 *    for pagination - that field was never implemented, so Deleted Posts' pagination was silently
 *    broken. $facet-added here so a real count comes back.
 */
export function buildPostsListPipeline({ matchQuery, search, skip, limit }: { matchQuery: Record<string, unknown>; search?: string; skip: number; limit: number }) {
  return [
    { $match: matchQuery },
    ...USER_LOOKUP_STAGES,
    ...buildSearchStage(search),
    {
      $facet: {
        data: [
          { $addFields: { sortDate: { $cond: { if: '$is_repost', then: '$reposted_date', else: '$date' } } } },
          { $sort: { sortDate: -1 as const } },
          { $skip: skip },
          { $limit: limit },
          ...DISPLAY_LOOKUP_STAGES,
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
