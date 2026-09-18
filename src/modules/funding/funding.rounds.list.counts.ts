// modules/funding/funding.rounds.list.counts.ts
//
// Ports funding_rounds.js's GET /list (legacy lines 27-227) status-count
// `$addFields` block verbatim — SEPARATE user_* and company_* field
// families computed unconditionally on every document (not a single set
// of fields switched by $cond, unlike the funding_investor_types.js
// sibling). Split out of funding.rounds.list.queries.ts purely to stay
// under the file-length limit.

export function buildFundingRoundsStatusCountsStage(): object {
  return {
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
  }
}
