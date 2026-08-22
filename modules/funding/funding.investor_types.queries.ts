// modules/funding/funding.investor_types.queries.ts
import { buildPaginatedFacetStages } from '../common/common.pagination'

/**
 * Ports the $match stage of funding_investor_types.js's GET /list handler
 * (legacy lines 14-25) verbatim: optional case-insensitive category_name
 * search, optional investor_type filter.
 */
export function buildFundingInvestorTypesListMatch({ search, investorType }: { search?: string; investorType?: number }): Record<string, any> {
  const matchQuery: Record<string, any> = {}
  if (search) {
    matchQuery.category_name = { $regex: search.trim(), $options: 'i' }
  }
  if (investorType !== undefined && !Number.isNaN(investorType)) {
    matchQuery.investor_type = investorType
  }
  return matchQuery
}

/**
 * Ports funding_investor_types.js's GET /list aggregation (legacy lines 27-246)
 * verbatim: the polymorphic $lookup into cln_funding_investment_lists (matching
 * investor_category_row_id + investor_type via $expr), the split of the
 * resulting `fundings` into user_ids (investor_type 1) / company_ids
 * (investor_type 2), the conditional $lookup into cln_professionals /
 * cln_company_lists, and the single set of pending/approved/disabled/rejected
 * counts computed via $cond on `$investor_type` (1 = User branch reads
 * `$users`, 2 = Company branch reads `$companies`) — this conditional branching
 * is NOT simplified or approximated, it is copied structurally as-is.
 * Pagination ($facet via buildPaginatedFacetStages) is appended per this
 * module-wide convention (FIX #5) — the legacy handler had none.
 */
export function buildFundingInvestorTypesListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, any>; skip: number; limit: number }): object[] {
  return [
    { $match: matchQuery },

    {
      $lookup: {
        from: 'cln_funding_investment_lists',
        let: { type_id: '$_id', inv_type: '$investor_type' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$investor_category_row_id', '$$type_id'] }, { $eq: ['$investor_type', '$$inv_type'] }],
              },
            },
          },
        ],
        as: 'fundings',
      },
    },

    {
      $addFields: {
        user_ids: {
          $setUnion: [
            {
              $map: {
                input: {
                  $filter: {
                    input: '$fundings',
                    as: 'f',
                    cond: { $eq: ['$$f.investor_type', 1] },
                  },
                },
                as: 'u',
                in: '$$u.investor_row_id',
              },
            },
            [],
          ],
        },
        company_ids: {
          $setUnion: [
            {
              $map: {
                input: {
                  $filter: {
                    input: '$fundings',
                    as: 'f',
                    cond: { $eq: ['$$f.investor_type', 2] },
                  },
                },
                as: 'c',
                in: '$$c.investor_row_id',
              },
            },
            [],
          ],
        },
      },
    },

    {
      $lookup: {
        from: 'cln_professionals',
        localField: 'user_ids',
        foreignField: '_id',
        as: 'users',
      },
    },

    // LOOKUP COMPANIES (ALWAYS)
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_ids',
        foreignField: '_id',
        as: 'companies',
      },
    },

    // SINGLE SET OF COUNTS (BASED ON investor_type)
    {
      $addFields: {
        pending_count: {
          $cond: [
            { $eq: ['$investor_type', 1] },
            // USERS
            {
              $size: {
                $filter: {
                  input: '$users',
                  as: 'u',
                  cond: {
                    $and: [{ $eq: ['$$u.approval_status', 0] }, { $eq: ['$$u.login_status', 1] }],
                  },
                },
              },
            },
            // COMPANIES
            {
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
          ],
        },

        approved_count: {
          $cond: [
            { $eq: ['$investor_type', 1] },
            {
              $size: {
                $filter: {
                  input: '$users',
                  as: 'u',
                  cond: {
                    $and: [{ $eq: ['$$u.approval_status', 1] }, { $eq: ['$$u.login_status', 1] }],
                  },
                },
              },
            },
            {
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
          ],
        },

        disabled_count: {
          $cond: [
            { $eq: ['$investor_type', 1] },
            {
              $size: {
                $filter: {
                  input: '$users',
                  as: 'u',
                  cond: { $eq: ['$$u.login_status', 0] },
                },
              },
            },
            {
              $size: {
                $filter: {
                  input: '$companies',
                  as: 'c',
                  cond: { $eq: ['$$c.active_status', 0] },
                },
              },
            },
          ],
        },

        rejected_count: {
          $cond: [
            { $eq: ['$investor_type', 1] },
            {
              $size: {
                $filter: {
                  input: '$users',
                  as: 'u',
                  cond: { $eq: ['$$u.approval_status', 2] },
                },
              },
            },
            {
              $size: {
                $filter: {
                  input: '$companies',
                  as: 'c',
                  cond: { $eq: ['$$c.approval_status', 2] },
                },
              },
            },
          ],
        },
      },
    },

    // CLEANUP
    {
      $project: {
        fundings: 0,
        users: 0,
        companies: 0,
        user_ids: 0,
        company_ids: 0,
      },
    },

    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

/**
 * Ports the delete guard's usage-check filter (legacy GET /delete/:category_row_id,
 * line 347) verbatim: whether any fundingInvestmentM document references this
 * category via investor_category_row_id.
 */
export function buildFundingInvestorTypeUsageCheckFilter(categoryRowId: number): Record<string, unknown> {
  return { investor_category_row_id: categoryRowId }
}
