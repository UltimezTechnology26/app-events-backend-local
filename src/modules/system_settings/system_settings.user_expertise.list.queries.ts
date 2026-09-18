// modules/system_settings/system_settings.user_expertise.list.queries.ts
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's GET /list
// (lines 11-143) match + aggregation stages verbatim. Split out of
// system_settings.user_expertise.queries.ts purely to stay under the
// file-length limit — the CRUD data-access functions live there. Same
// filter_array/$and pattern as area_of_interests.js: an optional
// designation_name regex search and an optional active_status boolean
// (`req.query.status === "1"`), wrapped in `{ $and: filter_array }` only
// if non-empty. The single `$lookup` into `cln_professionals` plus its
// five `$addFields` status-count blocks (pending/approved/rejected/
// disabled/deleted) are copied verbatim, PLUS the unique
// `total_users: { $size: "$users" }` field this category adds that no
// sibling category exposes.

const userDesignationsM = require('../../../models/app/static/user_designationsM')

export function buildUserExpertiseListStages(filters: { search?: string; status?: string }): object[] {
  const filterArray: Record<string, unknown>[] = []

  if (filters.search) {
    filterArray.push({ designation_name: { $regex: filters.search, $options: 'i' } })
  }

  if (filters.status !== undefined) {
    filterArray.push({ active_status: filters.status === '1' })
  }

  const matchStage = filterArray.length > 0 ? { $and: filterArray } : {}

  return [
    { $match: matchStage },
    {
      $lookup: {
        from: 'cln_professionals',
        let: { designationId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$$designationId', { $ifNull: ['$designation_id', []] }],
              },
            },
          },
          {
            $project: {
              approval_status: 1,
              login_status: 1,
            },
          },
        ],
        as: 'users',
      },
    },
    {
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
              cond: {
                $and: [{ $eq: ['$$u.approval_status', 2] }, { $eq: ['$$u.login_status', 1] }],
              },
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
        total_users: { $size: '$users' },
      },
    },
    { $project: { users: 0 } },
    { $sort: { designation_name: 1 } },
  ]
}

export async function fetchUserExpertiseList(stages: object[]) {
  return userDesignationsM.aggregate(stages)
}
