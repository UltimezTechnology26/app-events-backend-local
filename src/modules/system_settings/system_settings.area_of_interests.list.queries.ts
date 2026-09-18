// modules/system_settings/system_settings.area_of_interests.list.queries.ts
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's GET
// /list (lines 13-137) match + aggregation stages verbatim. Split out of
// system_settings.area_of_interests.queries.ts purely to stay under the
// file-length limit — the CRUD data-access functions live there. The
// legacy handler builds a `filter_array` from an optional `name` regex
// search and an optional `active_status` boolean (`req.query.status ===
// "1"`), then wraps it in `{ $and: filter_array }` only if the array is
// non-empty — reproduced exactly (no unconditional `$match: {}`). The
// single `$lookup` into `cln_professionals` plus its five `$addFields`
// status-count blocks (pending/approved/rejected/disabled/deleted) are
// copied verbatim, including the `$ifNull: ["$looking_for_id", []]` guard
// inside the sub-pipeline's `$expr`.

const userLookingForM = require('../../../models/app/static/user_looking_forM')

export function buildAreaOfInterestsListStages(filters: { search?: string; status?: string }): object[] {
  const filterArray: Record<string, unknown>[] = []

  if (filters.search) {
    filterArray.push({ name: { $regex: filters.search, $options: 'i' } })
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
        let: { lfId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$$lfId', { $ifNull: ['$looking_for_id', []] }],
              },
            },
          },
          {
            $project: {
              approval_status: '$approval_status',
              login_status: '$login_status',
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
    },
    { $project: { users: 0 } },
    { $sort: { name: 1 } },
  ]
}

export async function fetchAreaOfInterestsList(stages: object[]) {
  return userLookingForM.aggregate(stages)
}
