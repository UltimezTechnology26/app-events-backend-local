// modules/community-admin/community-admin.challenge.queries.ts
// Ports 21dayschallenge.js's GET /list/:skip/:limit (~line 8-95) aggregation-building logic.

export function buildChallengeMatchConditions({ search, startDate, endDate }: { search?: string; startDate?: string; endDate?: string }): Record<string, unknown> {
  const matchConditions: Record<string, unknown> = {}

  if (search) {
    matchConditions.$or = [
      { 'user_info.full_name': { $regex: search, $options: 'i' } },
      { 'user_info.user_name': { $regex: search, $options: 'i' } },
      { 'user_info.email_id': { $regex: search, $options: 'i' } },
    ]
  }

  const start = startDate ? new Date(startDate) : undefined
  const end = endDate ? new Date(endDate) : undefined
  if (start && end) {
    matchConditions.date_n_time = { $gte: start, $lte: end }
  } else if (start) {
    matchConditions.date_n_time = { $gte: start }
  } else if (end) {
    matchConditions.date_n_time = { $lte: end }
  }

  return matchConditions
}

/**
 * $facet-converted version of /list's pipeline. Legacy's own search/date $match already runs
 * BEFORE $skip/$limit here (unlike posts.js's deleted_list) - no reordering needed, only the
 * missing total-count field is fixed (legacy never returned one at all, confirmed by reading the
 * full response: `{status: true, message: data}`).
 */
export function buildChallengeListPipeline({ matchConditions, skip, limit }: { matchConditions: Record<string, unknown>; skip: number; limit: number }) {
  return [
    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_row_id',
        foreignField: '_id',
        as: 'user_info',
        pipeline: [
          { $lookup: { from: 'cln_professionals_profile_images', localField: '_id', foreignField: 'user_row_id', as: 'img_info' } },
          { $unwind: { path: '$img_info', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, full_name: 1, pro_batch: 1, approval_status: 1, email_id: 1, profile_image: '$img_info.profile_image', wallet_address: 1 } },
        ],
      },
    },
    // CONFIRMED PRE-EXISTING QUIRK, ported as-is (flagged, not fixed): a non-preserving $unwind -
    // any challenge row whose user_row_id doesn't resolve to a real professional document is
    // silently dropped from every result, unlike every other pipeline in this migration which
    // uses `preserveNullAndEmptyArrays: true`. Changing this would surface previously-invisible
    // rows, a real behavior change needing sign-off first.
    { $unwind: '$user_info' },
    { $lookup: { from: 'cln_main_community_groups', localField: 'group_ids', foreignField: '_id', as: 'group_info' } },
    { $match: matchConditions },
    {
      $facet: {
        data: [{ $sort: { date_n_time: -1 as const } }, { $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]
}

export function extractChallengeListResult(aggregateOutput: { data: Record<string, unknown>[]; totalCount: { count: number }[] }[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, count: facetResult.totalCount[0]?.count ?? 0 }
}
