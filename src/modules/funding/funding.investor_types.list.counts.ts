// modules/funding/funding.investor_types.list.counts.ts
//
// Ports funding_investor_types.js's GET /list (legacy lines 27-246) single
// set of pending/approved/disabled/rejected `$addFields` counts, computed
// via `$cond` on `$investor_type` (1 = User branch reads `$users`, 2 =
// Company branch reads `$companies`) — this conditional branching is NOT
// simplified or approximated, it is copied structurally as-is. Split out
// of funding.investor_types.list.queries.ts purely to stay under the
// file-length limit.

export function buildFundingInvestorTypesStatusCountsStage(): object {
  return {
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
  }
}
