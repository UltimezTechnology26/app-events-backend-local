// modules/funding/funding.investor_types.list.queries.ts
//
// Ports funding_investor_types.js's GET /list (legacy lines 14-246) match +
// aggregation verbatim: the polymorphic $lookup into
// cln_funding_investment_lists (matching investor_category_row_id +
// investor_type via $expr), the split of the resulting `fundings` into
// user_ids (investor_type 1) / company_ids (investor_type 2), and the
// conditional $lookup into cln_professionals / cln_company_lists. The
// pending/approved/disabled/rejected counts themselves live in
// funding.investor_types.list.counts.ts — split out purely to stay under
// the file-length limit. Pagination ($facet via buildPaginatedFacetStages)
// is appended per this module-wide convention (FIX #5) — the legacy
// handler had none.

import { buildPaginatedFacetStages } from '../common/common.pagination'
import { buildFundingInvestorTypesStatusCountsStage } from './funding.investor_types.list.counts'

const funding_investor_typesM = require('../../../models/app/static/funding_investor_typesM')

export function buildFundingInvestorTypesListMatch({ search, investorType }: { search?: string; investorType?: number }): Record<string, unknown> {
  const matchQuery: Record<string, unknown> = {}
  if (search) {
    matchQuery.category_name = { $regex: search.trim(), $options: 'i' }
  }
  if (investorType !== undefined && !Number.isNaN(investorType)) {
    matchQuery.investor_type = investorType
  }
  return matchQuery
}

export function buildFundingInvestorTypesListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, unknown>; skip: number; limit: number }): object[] {
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

    buildFundingInvestorTypesStatusCountsStage(),

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

export async function fetchFundingInvestorTypesList(matchQuery: Record<string, unknown>, skip: number, limit: number) {
  return funding_investor_typesM.aggregate(buildFundingInvestorTypesListPipeline({ matchQuery, skip, limit }))
}
