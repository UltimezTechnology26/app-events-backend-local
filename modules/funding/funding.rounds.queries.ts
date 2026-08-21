// modules/funding/funding.rounds.queries.ts
import { buildPaginatedFacetStages } from '../common/common.pagination'

/**
 * Ports the $match stage of funding_rounds.js's GET /list handler (legacy
 * lines 18-25) verbatim: optional case-insensitive category_name search.
 * Unlike funding_investor_types.js, there is no investor_type filter here —
 * this category has no such field.
 */
export function buildFundingRoundsListMatch({ search }: { search?: string }): Record<string, any> {
  const matchQuery: Record<string, any> = {}
  if (search) {
    matchQuery.category_name = { $regex: search.trim(), $options: 'i' }
  }
  return matchQuery
}

/**
 * Ports funding_rounds.js's GET /list aggregation (legacy lines 27-227)
 * verbatim. This is a DIFFERENT, more verbose shape than its sibling
 * funding_investor_types.js's list pipeline, and that difference is
 * intentional and must be preserved exactly, not normalized to match:
 *
 * - The $lookup into cln_funding_investment_lists here is a plain
 *   localField/foreignField match on `category_row_id` (no $expr, no
 *   investor_type matching inside the lookup itself) — unlike
 *   funding_investor_types.js's $expr-based lookup keyed on both
 *   investor_category_row_id AND investor_type.
 * - user_ids/company_ids are built with a plain $map over the $filter
 *   (investor_type 1 / 2 respectively) — NOT wrapped in $setUnion like the
 *   sibling file, so no deduplication is applied here (verbatim port).
 * - BOTH cln_professionals and cln_company_lists are looked up
 *   UNCONDITIONALLY (every document gets both lookups run), rather than the
 *   sibling's single unified count computed via $cond on investor_type.
 * - The counts are SEPARATE field families: user_pending_count,
 *   user_approved_count, user_rejected_count, user_disabled_count,
 *   user_deleted_count, company_pending_count, company_approved_count,
 *   company_rejected_count, company_disabled_count — all present on every
 *   document at once (not a single set of pending/approved/disabled/rejected
 *   fields switched by $cond).
 * - The $project cleanup here removes only `fundings`, `users`, `companies`
 *   — it does NOT strip `user_ids`/`company_ids` from the output (unlike the
 *   sibling file, which removes them too). This is a verbatim difference:
 *   `user_ids` and `company_ids` remain present in each returned document.
 * - A $sort on category_name:1 is applied (the sibling file has no such
 *   sort).
 *
 * Pagination ($facet via buildPaginatedFacetStages) is appended per this
 * module-wide convention — the legacy handler had none.
 */
export function buildFundingRoundsListPipeline({ matchQuery, skip, limit }: { matchQuery: Record<string, any>; skip: number; limit: number }): object[] {
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

    {
      $addFields: {
        // USERS
        user_pending_count: {
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

        user_approved_count: {
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

        user_rejected_count: {
          $size: {
            $filter: {
              input: '$users',
              as: 'u',
              cond: {
                $and: [{ $eq: ['$$u.approval_status', 2] }, { $eq: ['$$u.login_status', 1] }],
              },
            },
          },
        },

        user_disabled_count: {
          $size: {
            $filter: {
              input: '$users',
              as: 'u',
              cond: { $eq: ['$$u.login_status', 0] },
            },
          },
        },

        user_deleted_count: {
          $size: {
            $filter: {
              input: '$users',
              as: 'u',
              cond: { $eq: ['$$u.login_status', 2] },
            },
          },
        },

        // COMPANIES
        company_pending_count: {
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

        company_approved_count: {
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

        company_rejected_count: {
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

        company_disabled_count: {
          $size: {
            $filter: {
              input: '$companies',
              as: 'c',
              cond: { $eq: ['$$c.active_status', 0] },
            },
          },
        },
      },
    },

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
