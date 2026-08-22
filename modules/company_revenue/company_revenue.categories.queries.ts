// modules/company_revenue/company_revenue.categories.queries.ts
import { buildPaginatedFacetStages } from '../common/common.pagination'

/**
 * Ports the $match stage of revenue_streams.js's GET /list handler (legacy
 * lines 15-21) verbatim: optional case-insensitive category_name search. The
 * legacy handler uses `req.query?.search?.trim()` for BOTH the truthiness
 * check and the regex value — trimmed here to match exactly (matching the
 * pattern already used in modules/funding/funding.rounds.queries.ts).
 */
export function buildRevenueStreamCategoriesListMatch({ search }: { search?: string }): Record<string, any> {
  const matchStage: Record<string, any> = {}
  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    matchStage.category_name = { $regex: trimmedSearch, $options: 'i' }
  }
  return matchStage
}

/**
 * Ports revenue_streams.js's GET /list aggregation (legacy lines 22-156)
 * verbatim: the $lookup into cln_company_revenue_details matching
 * category_row_id inside each revenue record's nested revenue_streams array
 * (via $map + $in against $$category_id), the derived company_ids, the
 * $lookup into cln_company_lists / cln_company_deleted_history_lists, and the
 * approved/pending/rejected/disabled/deleted counts computed off them.
 * Pagination ($facet via buildPaginatedFacetStages) is appended per this
 * module-wide convention (FIX #5) — the legacy handler had none.
 */
export function buildRevenueStreamCategoriesListPipeline({
  matchStage,
  skip,
  limit,
}: {
  matchStage: Record<string, any>
  skip: number
  limit: number
}): object[] {
  return [
    { $match: matchStage },
    {
      $lookup: {
        from: 'cln_company_revenue_details',
        let: { category_id: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: [
                  '$$category_id',
                  {
                    $map: {
                      input: { $ifNull: ['$revenue_streams', []] },
                      as: 'r',
                      in: '$$r.category_row_id',
                    },
                  },
                ],
              },
            },
          },
        ],
        as: 'revenues',
      },
    },
    {
      $addFields: {
        company_ids: {
          $setUnion: [
            {
              $map: {
                input: '$revenues',
                as: 'r',
                in: '$$r.company_row_id',
              },
            },
            [],
          ],
        },
      },
    },
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_ids',
        foreignField: '_id',
        as: 'companies',
      },
    },
    {
      $lookup: {
        from: 'cln_company_deleted_history_lists',
        localField: 'company_ids',
        foreignField: '_id',
        as: 'deleted_companies',
      },
    },
    {
      $addFields: {
        approved_count: {
          $size: {
            $filter: {
              input: '$companies',
              as: 'c',
              cond: {
                $and: [{ $eq: ['$$c.approval_status', 1] }, { $eq: ['$$c.active_status', 1] }],
              },
            },
          },
        },
        pending_count: {
          $size: {
            $filter: {
              input: '$companies',
              as: 'c',
              cond: {
                $and: [{ $eq: ['$$c.approval_status', 0] }, { $eq: ['$$c.active_status', 1] }],
              },
            },
          },
        },
        rejected_count: {
          $size: {
            $filter: {
              input: '$companies',
              as: 'c',
              cond: {
                $and: [{ $eq: ['$$c.approval_status', 2] }, { $eq: ['$$c.active_status', 1] }],
              },
            },
          },
        },
        disabled_count: {
          $size: {
            $filter: {
              input: '$companies',
              as: 'c',
              cond: { $eq: ['$$c.active_status', 0] },
            },
          },
        },
        deleted_count: {
          $size: '$deleted_companies',
        },
      },
    },
    {
      $project: {
        revenues: 0,
        companies: 0,
        company_ids: 0,
      },
    },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

/**
 * Ports the delete guard's usage-check filter (legacy GET /delete/:category_row_id,
 * lines 239) verbatim: whether any company_revenue_growthM document has this
 * category_row_id inside its revenue_streams array.
 */
export function buildRevenueStreamUsageCheckFilter(categoryRowId: number): Record<string, unknown> {
  return { 'revenue_streams.category_row_id': categoryRowId }
}
