// modules/company/company.categories.queries.ts
import { buildPaginatedFacetStages } from '../common/common.pagination'

/**
 * Ports the $match stage of company_business_model.js's GET /list handler
 * (lines 19-35) verbatim: optional case-insensitive business_name search plus
 * an optional active_status filter derived from ?status=0/1.
 */
export function buildCompanyCategoriesListMatch({
  search,
  status,
}: {
  search?: string
  status?: string
}): Record<string, any> {
  const filter_array: Record<string, any>[] = []

  if (search) {
    filter_array.push({
      business_name: { $regex: search, $options: 'i' },
    })
  }

  if (status !== undefined && status !== '') {
    if (status === '1') {
      filter_array.push({ active_status: true })
    } else if (status === '0') {
      filter_array.push({ active_status: false })
    }
  }

  return filter_array.length > 0 ? { $and: filter_array } : {}
}

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
  matchStage: Record<string, any>
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
