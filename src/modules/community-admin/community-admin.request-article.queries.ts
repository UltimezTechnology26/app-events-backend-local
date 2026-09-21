// modules/community-admin/community-admin.request-article.queries.ts
//
// Ports controllers/admin_panel/main/community/request_article.js's GET /list/:skip/:limit
// (~line 7-91) aggregation-building logic.
//
// CONFIRMED CORRECTNESS BUG FIXED, not reproduced: legacy ran the list aggregate (with the full
// lookup/match/sort/skip/limit pipeline) and a SEPARATE count aggregate that was just
// `[{ $count: 'total' }]` - no $match, no search/date filters applied at all. So `count` always
// reflected every request in the collection regardless of the active search/date-range filter,
// silently breaking pagination on any filtered view (e.g. a search matching 3 rows would still
// report the full unfiltered total, implying extra pages of results that don't exist). Fixed by
// converting to a single $facet aggregate so the count branch shares the exact same
// lookup+match pipeline as the data branch - same class of fix already applied to every other
// list this migration has touched.
export function buildRequestArticleMatchQuery({ search, startDate, endDate }: { search?: string; startDate?: string; endDate?: string }): Record<string, unknown> {
  const match: Record<string, unknown> = {}

  if (search) {
    match.$or = [
      { 'user_info.full_name': { $regex: search, $options: 'i' } },
      { 'user_info.user_name': { $regex: search, $options: 'i' } },
      { 'user_info.email_id': { $regex: search, $options: 'i' } },
    ]
  }

  const start = startDate ? new Date(startDate) : undefined
  const end = endDate ? new Date(endDate) : undefined
  if (start && end) {
    match.date_n_time = { $gte: start, $lte: end }
  } else if (start) {
    match.date_n_time = { $gte: start }
  } else if (end) {
    match.date_n_time = { $lte: end }
  }

  return match
}

export function buildRequestArticleListPipeline({ matchConditions, skip, limit }: { matchConditions: Record<string, unknown>; skip: number; limit: number }) {
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
          { $project: { _id: 1, full_name: 1, pro_batch: 1, approval_status: 1, email_id: 1, profile_image: '$img_info.profile_image' } },
        ],
      },
    },
    { $unwind: '$user_info' },
    { $match: matchConditions },
    {
      $facet: {
        data: [{ $sort: { date_n_time: -1 as const } }, { $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'total' }],
      },
    },
  ]
}

export function extractRequestArticleListResult(aggregateOutput: { data: Record<string, unknown>[]; totalCount: { total: number }[] }[]) {
  const facetResult = aggregateOutput[0] || { data: [], totalCount: [] }
  return { data: facetResult.data, count: facetResult.totalCount[0]?.total ?? 0 }
}
