// modules/company/company.categories.list.queries.ts
//
// List/aggregation data-access for Company Categories. The $match filter
// builder lives in company.categories.queries.ts alongside the CRUD
// data-access functions — split out purely to stay under the file-length
// limit.
import { buildPaginatedFacetStages } from '../common/common.pagination'

const company_business_modelsM = require('../../../models/app/static/company_business_modelsM')

/**
 * Ports company_business_model.js's GET /list aggregation (lines 37-159)
 * verbatim: the $lookup into cln_company_lists and
 * cln_company_deleted_history_lists by business_model_id, and the
 * pending/approved/rejected/disabled/deleted counts computed off them.
 * Pagination ($facet via buildPaginatedFacetStages) is appended per this
 * module-wide convention (FIX #5) — the legacy handler had none, defaulting
 * to a full list when skip/limit are both omitted (skip=0, limit=0 means "no
 * paging" is handled by the caller passing a large enough limit or by
 * extractPaginatedResult still returning the full `data` array when the
 * facet's $limit is effectively unbounded).
 */
export function buildCompanyCategoriesListPipeline({
  matchStage,
  skip,
  limit,
}: {
  matchStage: Record<string, unknown>
  skip: number
  limit: number
}) {
  return [
    { $match: matchStage },
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: 'cln_company_lists',
        let: { businessModelId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$$businessModelId', { $ifNull: ['$business_model_id', []] }],
              },
            },
          },
          {
            $project: {
              approval_status: 1,
              active_status: 1,
            },
          },
        ],
        as: 'companies',
      },
    },
    {
      $lookup: {
        from: 'cln_company_deleted_history_lists',
        let: { businessModelId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$$businessModelId', { $ifNull: ['$business_model_id', []] }],
              },
            },
          },
          {
            $project: { _id: 1 },
          },
        ],
        as: 'deleted_companies',
      },
    },
    {
      $addFields: {
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
        rejected_count: {
          $size: {
            $filter: {
              input: '$companies',
              as: 'c',
              cond: { $eq: ['$$c.approval_status', 2] },
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
    { $project: { companies: 0 } },
    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

export async function fetchCompanyCategoriesList(matchStage: Record<string, unknown>, skip: number, limit: number) {
  return company_business_modelsM.aggregate(buildCompanyCategoriesListPipeline({ matchStage, skip, limit }))
}
