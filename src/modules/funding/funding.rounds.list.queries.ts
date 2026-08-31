// modules/funding/funding.rounds.list.queries.ts
//
// Ports funding_rounds.js's GET /list (legacy lines 18-227) match +
// aggregation verbatim. This is a DIFFERENT, more verbose shape than its
// sibling funding_investor_types.js's list pipeline, and that difference
// is intentional and must be preserved exactly, not normalized to match:
//
// - The $lookup into cln_funding_investment_lists here is a plain
//   localField/foreignField match on `category_row_id` (no $expr, no
//   investor_type matching inside the lookup itself) — unlike
//   funding_investor_types.js's $expr-based lookup keyed on both
//   investor_category_row_id AND investor_type.
// - user_ids/company_ids are built with a plain $map over the $filter
//   (investor_type 1 / 2 respectively) — NOT wrapped in $setUnion like the
//   sibling file, so no deduplication is applied here (verbatim port).
// - BOTH cln_professionals and cln_company_lists are looked up
//   UNCONDITIONALLY (every document gets both lookups run), rather than the
//   sibling's single unified count computed via $cond on investor_type.
// - The status-count fields (built in funding.rounds.list.counts.ts, split
//   out purely to stay under the file-length limit) are SEPARATE field
//   families — user_pending_count/user_approved_count/etc. and
//   company_pending_count/company_approved_count/etc. — all present on
//   every document at once.
// - The $project cleanup here removes only `fundings`, `users`, `companies`
//   — it does NOT strip `user_ids`/`company_ids` from the output (unlike
//   the sibling file). `user_ids`/`company_ids` remain present verbatim.
// - A $sort on category_name:1 is applied (the sibling file has no sort).
//
// Pagination ($facet via buildPaginatedFacetStages) is appended per this
// module-wide convention — the legacy handler had none.

import { buildPaginatedFacetStages } from '../common/common.pagination'
import { buildFundingRoundsStatusCountsStage } from './funding.rounds.list.counts'

const funding_roundsM = require('../../../models/app/static/funding_roundsM')

export function buildFundingRoundsListMatch({ search }: { search?: string }): Record<string, unknown> {
  const matchQuery: Record<string, unknown> = {}
  if (search) {
    matchQuery.category_name = { $regex: search.trim(), $options: 'i' }
  }
  return matchQuery
}

export function buildFundingRoundsListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, unknown>; skip: number; limit: number }): object[] {
  return [
    { $match: matchQuery },

    {
      $lookup: {
        from: 'cln_funding_investment_lists',
        localField: '_id',
        foreignField: 'category_row_id',
        as: 'fundings',
      },
    },

    {
      $addFields: {
        user_ids: {
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
        company_ids: {
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

    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_ids',
        foreignField: '_id',
        as: 'companies',
      },
    },

    buildFundingRoundsStatusCountsStage(),

    {
      $project: {
        fundings: 0,
        users: 0,
        companies: 0,
      },
    },

    { $sort: { category_name: 1 } },

    ...buildPaginatedFacetStages({ skip, limit }),
  ]
}

export async function fetchFundingRoundsList(matchQuery: Record<string, unknown>, skip: number, limit: number) {
  return funding_roundsM.aggregate(buildFundingRoundsListPipeline({ matchQuery, skip, limit }))
}
