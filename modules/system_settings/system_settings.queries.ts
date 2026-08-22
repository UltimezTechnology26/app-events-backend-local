// modules/system_settings/system_settings.queries.ts
//
// Pure aggregation/filter-stage builders (no DB calls). Shared by all 5
// system-settings categories per the user's explicit no-subfeature-split
// decision. Tasks 2-5 add new `// ==== <Category> ====` sections below.
import { buildPaginatedFacetStages } from '../common/common.pagination'
const { getPresentDateTime } = require('../../utils/helpers/helper')

// ==== Experience Level ====

/**
 * Ports experience_level.js's GET /list handler, which runs a plain
 * `experience_levelsM.find()` with no filter at all (no search support, no
 * active_status filter). There is no aggregation pipeline in the legacy
 * handler to port verbatim, so this exports a plain-object filter builder
 * instead of aggregation stages. `search` is a new, additive optional
 * capability (fix #5 pagination work) — when omitted, the filter is `{}`,
 * which behaves identically to the legacy unfiltered `.find()`.
 */
export function buildExperienceLevelListFilter(filters: { search?: string }): Record<string, unknown> {
  const filter: Record<string, unknown> = {}
  if (filters.search) {
    filter.experience = { $regex: filters.search, $options: 'i' }
  }
  return filter
}

/**
 * Combines the filter above with the standard $facet pagination stages
 * (common.pagination.ts) so the service layer only needs to call `.aggregate()`.
 */
export function buildExperienceLevelListPipeline({
  filter,
  skip,
  limit,
}: {
  filter: Record<string, unknown>
  skip: number
  limit: number
}) {
  return [{ $match: filter }, ...buildPaginatedFacetStages({ skip, limit })]
}

// ==== Event Tags ====
//
// Ports controllers/admin_panel/category_tags/event_tags.js's GET /list
// (lines 12-167) match + aggregation stages verbatim. The legacy handler
// builds `matchCondition` from `active_status` and a `$or`-wrapped
// `event_tag` regex search, then only pushes a `$match` stage at all if
// `matchCondition` has keys — reproduced exactly below (no `$match` stage
// when there is no filter, rather than an unconditional `$match: {}`).
// The six `$lookup`/`$addFields` blocks (total_events, deleted_count,
// pending_count, upcoming, ongoing, ended_count) are copied verbatim,
// including the legacy quirk that "ongoing_count" is actually
// upcoming_temp + ongoing_temp combined via $add.

export function buildEventTagsListStages(filters: { search?: string; active_status?: string }): object[] {
  const present = new Date(getPresentDateTime())
  const matchCondition: Record<string, unknown> = {}

  if (filters.active_status !== undefined) {
    const statusValue = Number(filters.active_status)
    matchCondition.active_status = statusValue === 1
  }

  if (filters.search && filters.search.trim() !== '') {
    matchCondition.$or = [{ event_tag: { $regex: filters.search, $options: 'i' } }]
  }

  const pipeline: object[] = []

  if (Object.keys(matchCondition).length > 0) {
    pipeline.push({ $match: matchCondition })
  }

  pipeline.push(
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          { $match: { approval_status: 1, $expr: { $in: ['$$tagId', '$event_tags'] } } },
          { $count: 'count' },
        ],
        as: 'events_count_res',
      },
    },
    { $addFields: { total_events: { $ifNull: [{ $arrayElemAt: ['$events_count_res.count', 0] }, 0] } } },
    { $project: { events_count_res: 0 } },

    // Deleted events count
    {
      $lookup: {
        from: 'cln_deleted_events',
        let: { tagId: '$_id' },
        pipeline: [
          { $match: { $expr: { $in: ['$$tagId', '$event_tags'] } } },
          { $count: 'count' },
        ],
        as: 'deleted_res',
      },
    },
    { $addFields: { deleted_count: { $ifNull: [{ $arrayElemAt: ['$deleted_res.count', 0] }, 0] } } },
    { $project: { deleted_res: 0 } },

    // Pending count
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          { $match: { approval_status: 0, $expr: { $in: ['$$tagId', '$event_tags'] } } },
          { $count: 'count' },
        ],
        as: 'pending_res',
      },
    },
    { $addFields: { pending_count: { $ifNull: [{ $arrayElemAt: ['$pending_res.count', 0] }, 0] } } },
    { $project: { pending_res: 0 } },

    // Upcoming count
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          {
            $match: {
              approval_status: 1,
              start_date: { $gt: present },
              $expr: { $in: ['$$tagId', '$event_tags'] },
            },
          },
          { $count: 'count' },
        ],
        as: 'upcoming_res',
      },
    },
    { $addFields: { upcoming_temp: { $ifNull: [{ $arrayElemAt: ['$upcoming_res.count', 0] }, 0] } } },
    { $project: { upcoming_res: 0 } },

    // Ongoing count
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          {
            $match: {
              approval_status: 1,
              start_date: { $lte: present },
              end_date: { $gte: present },
              $expr: { $in: ['$$tagId', '$event_tags'] },
            },
          },
          { $count: 'count' },
        ],
        as: 'ongoing_res',
      },
    },
    { $addFields: { ongoing_temp: { $ifNull: [{ $arrayElemAt: ['$ongoing_res.count', 0] }, 0] } } },
    { $project: { ongoing_res: 0 } },

    // Combine ongoing + upcoming
    { $addFields: { ongoing_count: { $add: ['$ongoing_temp', '$upcoming_temp'] } } },
    { $project: { ongoing_temp: 0, upcoming_temp: 0 } },

    // Ended count
    {
      $lookup: {
        from: 'cln_events',
        let: { tagId: '$_id' },
        pipeline: [
          {
            $match: {
              approval_status: 1,
              end_date: { $lt: present },
              $expr: { $in: ['$$tagId', '$event_tags'] },
            },
          },
          { $count: 'count' },
        ],
        as: 'ended_res',
      },
    },
    { $addFields: { ended_count: { $ifNull: [{ $arrayElemAt: ['$ended_res.count', 0] }, 0] } } },
    { $project: { ended_res: 0 } },

    { $sort: { _id: -1 } }
  )

  return pipeline
}

/**
 * FIX #2 (approved): delete guard filter. Reuses the exact join technique the
 * legacy list aggregation above already proves works against `cln_events` —
 * `$expr: { $in: ["$$tagId", "$event_tags"] }` — expressed here as a plain
 * (non-aggregation) filter for use with `eventM.findOne()`, deliberately
 * WITHOUT an `approval_status` restriction so any live event referencing the
 * tag (pending or approved) blocks deletion, not only approved ones.
 */
export function buildEventTagUsageCheckFilter(tagId: number): Record<string, unknown> {
  return { event_tags: { $in: [tagId] } }
}

// ==== Area of Interests ====
//
// Ports controllers/admin_panel/category_tags/area_of_interests.js's GET
// /list (lines 13-137) match + aggregation stages verbatim. The legacy
// handler builds a `filter_array` from an optional `name` regex search and
// an optional `active_status` boolean (`req.query.status === "1"`), then
// wraps it in `{ $and: filter_array }` only if the array is non-empty —
// reproduced exactly (no unconditional `$match: {}`). The single `$lookup`
// into `cln_professionals` plus its five `$addFields` status-count blocks
// (pending/approved/rejected/disabled/deleted) are copied verbatim,
// including the `$ifNull: ["$looking_for_id", []]` guard inside the
// sub-pipeline's `$expr`.

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

/**
 * FIX #2 (approved): delete guard filter. Reuses the exact join technique the
 * legacy list aggregation above already proves works against
 * `cln_professionals` — `$expr: { $in: ["$$lfId", { $ifNull: ["$looking_for_id", []] }] }`
 * — expressed here as a plain (non-aggregation) filter for use with
 * `professionalsM.findOne()`. A plain `$in` match against the array-typed
 * `looking_for_id` field is the non-aggregation equivalent of the `$ifNull`
 * guarded `$expr` (a missing/absent field simply fails to match either way).
 */
export function buildAreaOfInterestUsageCheckFilter(lookingForId: number): Record<string, unknown> {
  return { looking_for_id: { $in: [lookingForId] } }
}

// ==== User Expertise ====
//
// Ports controllers/admin_panel/category_tags/user_expertise.js's GET /list
// (lines 11-143) match + aggregation stages verbatim. Same filter_array/$and
// pattern as area_of_interests.js above: an optional designation_name regex
// search and an optional active_status boolean (`req.query.status === "1"`),
// wrapped in `{ $and: filter_array }` only if non-empty. The single
// `$lookup` into `cln_professionals` plus its five `$addFields` status-count
// blocks (pending/approved/rejected/disabled/deleted) are copied verbatim,
// PLUS the unique `total_users: { $size: "$users" }` field this controller
// adds that no sibling category exposes (confirmed by reading the full file
// per Step 1 — no other legacy category_tags controller has this field).

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

/**
 * FIX #2 (approved): delete guard filter. Reuses the exact join technique the
 * legacy list aggregation above already proves works against
 * `cln_professionals` — `$expr: { $in: ["$$designationId", { $ifNull: ["$designation_id", []] }] }`
 * — expressed here as a plain (non-aggregation) filter for use with
 * `professionalsM.findOne()`, the same non-aggregation-equivalent technique
 * already used by `buildAreaOfInterestUsageCheckFilter` above (confirmed
 * against `models/app/professionalsM.js`'s `designation_id` field, which —
 * like `looking_for_id` — is stored untyped/array-shaped and queried via
 * `$in`).
 */
export function buildUserExpertiseUsageCheckFilter(designationId: number): Record<string, unknown> {
  return { designation_id: { $in: [designationId] } }
}
