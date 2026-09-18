// modules/work-experience/work-experience.positions.list.counts.ts
//
// Ports controllers/admin_panel/category_tags/positions.js's GET /list
// status-count `$addFields`/`$project` blocks verbatim. Split out of
// work-experience.positions.list.stages.ts purely to stay under the
// file-length limit.

export function buildUserStatusCountsStage(): object {
  return {
    $addFields: {
      pending_count: {
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
      approved_count: {
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
      rejected_count: {
        $size: {
          $filter: {
            input: '$users',
            as: 'u',
            cond: { $eq: ['$$u.approval_status', 2] },
          },
        },
      },
      disabled_count: {
        $size: {
          $filter: {
            input: '$users',
            as: 'u',
            cond: { $eq: ['$$u.login_status', 0] },
          },
        },
      },
      deleted_count: {
        $size: {
          $filter: {
            input: '$users',
            as: 'u',
            cond: { $eq: ['$$u.login_status', 2] },
          },
        },
      },
    },
  }
}

export function buildCompanyDeletedCountAndCleanupStages(): object[] {
  return [
    {
      $addFields: {
        company_deleted_count: {
          $size: '$deleted_companies',
        },
      },
    },
    {
      $project: {
        work_experience: 0,
        users: 0,
        companies: 0,
      },
    },
  ]
}
