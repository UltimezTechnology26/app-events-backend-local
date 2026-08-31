// modules/company_revenue/company_revenue.categories.list.queries.ts
//
// List/aggregation data-access for Revenue Stream Categories. The $match
// filter builder + CRUD data-access live in company_revenue.categories.queries.ts.
import { buildPaginatedFacetStages } from '../common/common.pagination'

const revenue_streamsM = require('../../../models/app/static/revenue_streams_categoryM')

/**
 * Ports revenue_streams.js's GET /list aggregation (legacy lines 22-156)
 * verbatim: $lookup into cln_company_revenue_details matching
 * category_row_id inside each revenue record's nested revenue_streams array
 * (via $map + $in against $$category_id), the derived company_ids, the
 * $lookup into cln_company_lists / cln_company_deleted_history_lists, and
 * the approved/pending/rejected/disabled/deleted counts off them. Pagination
 * ($facet via buildPaginatedFacetStages) is appended per convention (FIX #5).
 */
export function buildRevenueStreamCategoriesListPipeline({
  matchStage,
  skip,
  limit,
}: {
  matchStage: Record<string, unknown>
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

export async function fetchRevenueStreamCategoriesList(matchStage: Record<string, unknown>, skip: number, limit: number) {
  return revenue_streamsM.aggregate(buildRevenueStreamCategoriesListPipeline({ matchStage, skip, limit }))
}
