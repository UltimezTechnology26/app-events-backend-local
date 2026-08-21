// modules/work-experience/work-experience.positions.queries.ts
//
// Ports controllers/admin_panel/category_tags/positions.js's GET /list
// (lines 12-197) match + aggregation pipeline verbatim. Two things
// deliberately differ from the sibling category_tags modules already
// migrated into modules/system_settings/:
//
// - The legacy handler builds `filter` as a single plain object (never a
//   `filter_array`/`$and` wrapper) and always includes an (possibly empty)
//   `{ $match: filter }` as the pipeline's first stage — unlike
//   event_tags.js/area_of_interests.js, which conditionally omit the
//   `$match` stage entirely when there's nothing to filter on. Reproduced
//   exactly: `$match` always runs here, even with an empty filter object.
// - `active_status` is compared as a STRING ("1"/"0"), not coerced via
//   `Number(...) === 1` the way event_tags.js's list handler does it.
//   Preserved exactly per the task brief — do not normalize this to match
//   the sibling.
//
// The five `$lookup`/`$addFields` status-count blocks (pending/approved/
// rejected/disabled/deleted) plus the SIXTH `company_deleted_count` field
// (via a second `$lookup` into `cln_company_deleted_history_lists`) are
// copied verbatim — this extra field is unique to positions.js among the
// category_tags list handlers read so far.

export function buildPositionsListFilter(filters: { search?: string; active_status?: string }): Record<string, unknown> {
  const filter: Record<string, unknown> = {}

  if (filters.search) {
    filter.position_name = { $regex: filters.search.trim(), $options: 'i' }
  }

  if (filters.active_status === '1') {
    filter.active_status = true
  } else if (filters.active_status === '0') {
    filter.active_status = false
  }

  return filter
}

export function buildPositionsListStages(filters: { search?: string; active_status?: string }): object[] {
  const filter = buildPositionsListFilter(filters)

  return [
    { $match: filter },

    {
      $lookup: {
        from: 'cln_professionals_work_experiences',
        localField: '_id',
        foreignField: 'position_row_id',
        as: 'work_experience',
      },
    },
    {
      $addFields: {
        user_ids: {
          $setUnion: [
            {
              $map: {
                input: '$work_experience',
                as: 'we',
                in: '$$we.user_row_id',
              },
            },
            [],
          ],
        },
        company_ids: {
          $setUnion: [
            {
              $map: {
                input: '$work_experience',
                as: 'we',
                in: '$$we.company_row_id',
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
    {
      $lookup: {
        from: 'cln_company_lists',
        localField: 'company_ids',
        foreignField: '_id',
        as: 'companies',
      },
    },
    {
      $lookup: {
        from: 'cln_company_deleted_history_lists',
        let: { companyIds: '$company_ids' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$company_row_id', '$$companyIds'],
              },
            },
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
              input: '$users',
              as: 'u',
              cond: {
                $and: [
                  { $eq: ['$$u.approval_status', 0] },
                  { $eq: ['$$u.login_status', 1] },
                ],
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
                $and: [
                  { $eq: ['$$u.approval_status', 1] },
                  { $eq: ['$$u.login_status', 1] },
                ],
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

    { $sort: { position_name: 1 } },
  ]
}

/**
 * FIX #2 (approved): delete guard filter. `position_row_id` on
 * `cln_professionals_work_experiences` (models/app/professionals_work_experienceM.js,
 * lines ~35-38) is a scalar `Number` field (indexed, not an array), matching
 * exactly how the legacy list aggregation above joins it via
 * `foreignField: 'position_row_id'` in a plain (non-array) `$lookup`. A
 * scalar equality `findOne` is therefore the correct non-aggregation
 * equivalent — unlike the array-typed `$in`-based guards built for
 * event_tags/area_of_interests/user_expertise (Tasks 3-5).
 */
export function buildPositionUsageCheckFilter(positionRowId: number): Record<string, unknown> {
  return { position_row_id: positionRowId }
}
